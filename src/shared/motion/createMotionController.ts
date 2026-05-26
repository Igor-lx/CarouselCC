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
  clockArmed: boolean;
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

  const sampleActiveSegment = (
    activeSegment: ActiveSegment<Strategy>,
    timestamp: number,
  ): MotionSample<Strategy> => {
    const data = activeSegment.sampler(activeSegment.segment, timestamp);
    return {
      ...data,
      timestamp,
      phase: data.progress >= 1 ? "settled" : "running",
    };
  };

  const sampleActive = (timestamp: number): MotionSample<Strategy> => {
    if (!active) return sample;
    if (active.clockStart === "after-initial-frame" && !active.clockArmed) {
      return {
        ...sample,
        velocity: 0,
        timestamp,
        phase: "running",
      };
    }
    return sampleActiveSegment(active, timestamp);
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

    if (active.clockStart === "after-initial-frame" && !active.clockArmed) {
      active.segment = { ...active.segment, startedAt: timestamp };
      active.clockArmed = true;

      const initial = sampleActive(timestamp);
      emit(initial);

      if (initial.progress >= 1) {
        finalize(initial);
        return;
      }

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
      if (active?.clockStart === "after-initial-frame" && !active.clockArmed) {
        return {
          position: sample.value,
          velocity: 0,
          strategy: sample.strategy,
          timestamp,
        };
      }
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

      const nextActive: ActiveSegment<Strategy> = {
        segment,
        sampler: sampler as MotionSegmentSampler<
          MotionSegmentBase<Strategy>,
          Strategy
        >,
        onComplete,
        completion,
        clockStart,
        clockArmed: clockStart === "immediate",
      };
      active = nextActive;

      const initial = sampleActiveSegment(nextActive, segment.startedAt);
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
