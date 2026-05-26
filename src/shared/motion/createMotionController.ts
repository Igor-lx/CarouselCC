import type {
  MotionClockStart,
  MotionCompletionMode,
  MotionController,
  MotionHandoff,
  MotionSample,
  MotionSegmentBase,
  MotionSegmentSampler,
  MotionSetOptions,
  MotionSnapOptions,
  MotionStartOptions,
  MotionSubscriber,
} from "./types";

const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

const requestFrame = (callback: FrameRequestCallback): number | null =>
  typeof window === "undefined" ? null : window.requestAnimationFrame(callback);

const cancelFrame = (id: number | null) => {
  if (id !== null && typeof window !== "undefined") {
    window.cancelAnimationFrame(id);
  }
};

const createIdleSample = <Strategy extends string>(
  value: number,
  strategy: Strategy,
): MotionSample<Strategy> => ({
  progress: 1,
  value,
  velocity: 0,
  target: value,
  strategy,
  timestamp: now(),
  phase: "idle",
});

interface ActiveSegment<Strategy extends string> {
  segment: MotionSegmentBase<Strategy>;
  sampler: MotionSegmentSampler<MotionSegmentBase<Strategy>, Strategy>;
  onComplete?: (sample: MotionSample<Strategy>) => void;
  completion: MotionCompletionMode;
  clockStart: MotionClockStart;
  /**
   * The wall-clock timestamp the segment's elapsed counter should be measured
   * from. The segment object itself is treated as immutable input; this field
   * is the only place "when did the clock actually arm" lives.
   *
   * - `clockStart === "immediate"`: set to `segment.startedAt` at `start()`;
   *   the segment ticks normally from the first rAF.
   * - `clockStart === "after-initial-frame"`: `null` at `start()`; the first
   *   rAF tick after `start()` sets it to that rAF's `timestamp`, re-emits a
   *   `progress = 0` sample, and only the *next* rAF begins to advance. Any
   *   delay between `start()` and that first tick — the heavy commit-paint
   *   window — is absorbed into the `from` plateau instead of into elapsed
   *   segment time, so the user never sees a catch-up jump on the first
   *   observable motion frame.
   */
  clockArmedAt: number | null;
}

export function createMotionController<Strategy extends string = string>(
  initialValue = 0,
  initialStrategy: Strategy = "idle" as Strategy,
): MotionController<Strategy> {
  let sample = createIdleSample(initialValue, initialStrategy);
  let emittedSample = sample;
  let frameId: number | null = null;
  let completionFrameId: number | null = null;
  let active: ActiveSegment<Strategy> | null = null;
  const subscribers = new Set<MotionSubscriber<Strategy>>();

  const cancelTick = () => {
    cancelFrame(frameId);
    frameId = null;
  };

  const cancelCompletion = () => {
    cancelFrame(completionFrameId);
    completionFrameId = null;
  };

  const emit = (next: MotionSample<Strategy>) => {
    sample = next;
    emittedSample = next;
    subscribers.forEach((listener) => listener(next));
  };

  const sampleActive = (timestamp: number): MotionSample<Strategy> => {
    if (!active) return sample;

    // Before the clock is armed (`after-initial-frame` mode, first tick has
    // not yet fired) the segment has not actually started moving — every
    // observer sees a `progress = 0`/`from` plateau. This is what makes
    // `captureHandoff()` return zero velocity and the `from` position during
    // the unarmed window, and what lets the very first tick re-emit cleanly
    // before advancing on the next one.
    if (active.clockArmedAt === null) {
      return {
        progress: 0,
        value: active.segment.from,
        velocity: 0,
        target: active.segment.to,
        strategy: active.segment.strategy,
        timestamp,
        phase: "running",
      };
    }

    // The sampler reads `segment.startedAt` for its arithmetic, but the real
    // clock origin is `clockArmedAt`. We offset the timestamp we hand it so
    // the sampler sees `elapsed = timestamp - clockArmedAt` without ever
    // having to learn about arming — the segment object stays immutable.
    const startOffset = active.clockArmedAt - active.segment.startedAt;
    const data = active.sampler(active.segment, timestamp - startOffset);
    return {
      ...data,
      timestamp,
      phase: data.progress >= 1 ? "settled" : "running",
    };
  };

  const scheduleCompletion = (
    callback: (sample: MotionSample<Strategy>) => void,
    settled: MotionSample<Strategy>,
    completion: MotionCompletionMode,
  ) => {
    cancelCompletion();

    if (completion === "immediate") {
      callback(settled);
      return;
    }

    completionFrameId = requestFrame(() => {
      completionFrameId = null;
      callback(settled);
    });

    if (completionFrameId === null) {
      callback(settled);
    }
  };

  const finalize = (settled: MotionSample<Strategy>) => {
    const finished = active;
    cancelTick();
    active = null;

    const final: MotionSample<Strategy> = {
      ...settled,
      progress: 1,
      value: settled.target,
      phase: "settled",
    };

    emit(final);

    if (finished?.onComplete) {
      scheduleCompletion(finished.onComplete, final, finished.completion);
    }
  };

  const tick = (timestamp: number) => {
    if (!active) {
      frameId = null;
      return;
    }

    // First tick of an `after-initial-frame` segment: arm the clock at this
    // rAF's timestamp and re-emit a `progress = 0` sample. The heavy paint
    // window between `start()` and now is absorbed into the `from` plateau.
    // Real motion does not begin until the *next* tick.
    if (active.clockArmedAt === null) {
      active.clockArmedAt = timestamp;
      emit(sampleActive(timestamp));
      frameId = requestFrame(tick);
      return;
    }

    const next = sampleActive(timestamp);
    emit(next);

    if (next.progress >= 1) {
      finalize(next);
      return;
    }

    frameId = requestFrame(tick);
  };

  return {
    captureHandoff(timestamp = now()): MotionHandoff<Strategy> {
      // One coherent point: position and velocity from the SAME sample of the
      // active curve (or the resting sample when idle). No emit, no cancel, no
      // subscriber notification — just the math.
      const point = active ? sampleActive(timestamp) : sample;
      if (active) sample = point;
      return {
        position: point.value,
        velocity: point.velocity,
        strategy: point.strategy,
        timestamp,
      };
    },

    getSnapshot() {
      return emittedSample;
    },

    isActive() {
      return active !== null;
    },

    subscribe(listener, options) {
      subscribers.add(listener);
      if (options?.emitCurrent ?? true) listener(emittedSample);
      return () => {
        subscribers.delete(listener);
      };
    },

    start<Segment extends MotionSegmentBase<Strategy>>(
      options: MotionStartOptions<Segment, Strategy>,
    ) {
      cancelTick();
      cancelCompletion();
      const {
        segment,
        sampler,
        onComplete,
        completion = "next-frame",
        clockStart = "immediate",
      } = options;

      active = {
        segment,
        sampler: sampler as MotionSegmentSampler<
          MotionSegmentBase<Strategy>,
          Strategy
        >,
        onComplete,
        completion,
        clockStart,
        // `immediate`: the clock runs from `segment.startedAt` as given.
        // `after-initial-frame`: the first rAF tick arms it; sampleActive
        // returns the `from` plateau until then.
        clockArmedAt: clockStart === "immediate" ? segment.startedAt : null,
      };

      const initial = sampleActive(segment.startedAt);
      emit(initial);

      if (initial.progress >= 1) {
        finalize(initial);
        return;
      }

      frameId = requestFrame(tick);
    },

    set(value: number, options: MotionSetOptions<Strategy> = {}) {
      cancelTick();
      cancelCompletion();
      active = null;

      emit({
        progress: options.progress ?? 1,
        value,
        velocity: options.velocity ?? 0,
        target: options.target ?? value,
        strategy: options.strategy ?? sample.strategy,
        timestamp: now(),
        phase: options.phase ?? "idle",
      });
    },

    snap(value: number, options: MotionSnapOptions<Strategy> = {}) {
      cancelTick();
      cancelCompletion();
      active = null;

      const settled: MotionSample<Strategy> = {
        progress: 1,
        value,
        velocity: options.velocity ?? 0,
        target: options.target ?? value,
        strategy: options.strategy ?? sample.strategy,
        timestamp: now(),
        phase: "settled",
      };

      emit(settled);

      if (options.onComplete) {
        scheduleCompletion(options.onComplete, settled, options.completion ?? "next-frame");
      }
    },

    cancel() {
      const latest = active ? sampleActive(now()) : sample;
      cancelTick();
      cancelCompletion();
      active = null;
      emit({
        ...latest,
        progress: 1,
        timestamp: now(),
        phase: "idle",
      });
    },

    /**
     * Soft, idempotent teardown: cancels any active motion and clears
     * subscribers. The controller stays usable afterwards — `start`,
     * `subscribe`, `captureHandoff` all work — so a React StrictMode
     * unmount/remount can reuse the same instance. Call on real unmount.
     */
    destroy() {
      this.cancel();
      subscribers.clear();
    },
  };
}
