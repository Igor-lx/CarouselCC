export type MotionPhase = "idle" | "running" | "settled";

export interface MotionSample<Strategy extends string = string> {
  progress: number;
  value: number;
  velocity: number;
  target: number;
  strategy: Strategy;
  timestamp: number;
  phase: MotionPhase;
}

export interface MotionSampleData<Strategy extends string = string> {
  progress: number;
  value: number;
  velocity: number;
  target: number;
  strategy: Strategy;
}

/**
 * An atomic motion-continuation point: the coherent `(position, velocity)` of
 * the controller as of one `timestamp`. Returned by `captureHandoff` so a
 * caller starting a new segment cannot accidentally mix a position from one
 * moment with a velocity from another — there is exactly one method and one
 * answer. Distinct from `MotionSample` (the full visual frame for UI).
 */
export interface MotionHandoff<Strategy extends string = string> {
  position: number;
  velocity: number;
  strategy: Strategy;
  timestamp: number;
}

export interface MotionSegmentBase<Strategy extends string = string> {
  strategy: Strategy;
  from: number;
  to: number;
  duration: number;
  startedAt: number;
}

export type MotionSegmentSampler<
  Segment extends MotionSegmentBase<Strategy>,
  Strategy extends string = string,
> = (segment: Segment, timestamp: number) => MotionSampleData<Strategy>;

export type MotionCompletionMode = "immediate" | "next-frame";

/**
 * When the segment's wall-clock starts advancing relative to `segment.startedAt`.
 *
 * - `"immediate"` (default): the clock runs from `segment.startedAt` as passed
 *   in. Every rAF tick samples at `tick.timestamp - segment.startedAt`. This
 *   is the right mode for a controller that is already running visually (hot
 *   retarget continuation) or for tests / scripted motion where the caller
 *   guarantees `startedAt` is meaningfully aligned with the first paint.
 *
 * - `"after-initial-frame"`: the controller `start()` still synchronously
 *   emits an initial sample at `progress = 0` (so subscribers can write the
 *   resting `from` position to the DOM right away). The very next rAF tick
 *   then *arms* the clock by rewriting `segment.startedAt` to that rAF's
 *   timestamp and emits another `progress = 0` sample — and only from the
 *   rAF *after* that does the segment begin to advance. This absorbs the
 *   browser's "first heavy paint" delay (image decode / composite / etc.)
 *   into the `from` plateau instead of into elapsed segment time. Without
 *   this mode, a 100–300 ms paint delay after a click is added to the first
 *   visible tick's elapsed and the user sees a 20-30 px catch-up jump on
 *   the first observable motion frame.
 */
export type MotionClockStart = "immediate" | "after-initial-frame";

export interface MotionStartOptions<
  Segment extends MotionSegmentBase<Strategy>,
  Strategy extends string = string,
> {
  segment: Segment;
  sampler: MotionSegmentSampler<Segment, Strategy>;
  onComplete?: (sample: MotionSample<Strategy>) => void;
  completion?: MotionCompletionMode;
  clockStart?: MotionClockStart;
}

export interface MotionSetOptions<Strategy extends string = string> {
  velocity?: number;
  target?: number;
  strategy?: Strategy;
  progress?: number;
  phase?: MotionPhase;
}

export interface MotionSnapOptions<Strategy extends string = string>
  extends MotionSetOptions<Strategy> {
  onComplete?: (sample: MotionSample<Strategy>) => void;
  completion?: MotionCompletionMode;
}

export type MotionSubscriber<Strategy extends string = string> = (
  sample: MotionSample<Strategy>,
) => void;

export interface MotionController<Strategy extends string = string> {
  /**
   * The atomic motion-continuation point as of `timestamp` — a coherent
   * `(position, velocity)` from the active curve (or the resting sample when
   * idle). The single API for handing motion off to a new segment; it cannot
   * be mixed with `getSnapshot`. Does not emit, cancel, or notify subscribers.
   */
  captureHandoff: (timestamp?: number) => MotionHandoff<Strategy>;
  /** The last *emitted* visual frame — for UI reads, not motion handoff. */
  getSnapshot: () => MotionSample<Strategy>;
  isActive: () => boolean;
  subscribe: (
    listener: MotionSubscriber<Strategy>,
    options?: { emitCurrent?: boolean },
  ) => () => void;
  start: <Segment extends MotionSegmentBase<Strategy>>(
    options: MotionStartOptions<Segment, Strategy>,
  ) => void;
  set: (value: number, options?: MotionSetOptions<Strategy>) => void;
  snap: (value: number, options?: MotionSnapOptions<Strategy>) => void;
  cancel: () => void;
  destroy: () => void;
}
