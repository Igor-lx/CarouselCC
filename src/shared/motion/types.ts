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
 * When the segment's wall-clock starts advancing relative to `startedAt`.
 *
 * - `"immediate"` keeps the legacy behavior: every rAF samples elapsed time
 *   from the `startedAt` provided by the caller.
 * - `"after-initial-frame"` still emits the initial sample synchronously, then
 *   arms the clock on the next rAF and starts advancing only after that. This
 *   absorbs a heavy first paint into the `from` plateau instead of into hidden
 *   elapsed time.
 */
export type MotionClockStart = "immediate" | "after-initial-frame";

/**
 * Optional catch-up protection for visual timelines. When the browser misses
 * frames, wall-clock sampling would normally consume the full pause on the
 * next tick and visibly jump forward. This policy caps how much elapsed time a
 * single sampled frame may consume; any excess is absorbed by shifting the
 * active clock origin forward, stretching the segment instead of catching up.
 */
export interface MotionFrameDeltaClamp {
  /** Maximum elapsed time one sampled frame may advance by. */
  maxFrameDeltaMs: number;
  /**
   * Optional, tighter cap for the first advancing frame of a segment. Useful
   * when an initial plateau is used: the first visible movement should not
   * consume a multi-frame browser pause and read as a launch-speed burst.
   */
  firstFrameDeltaMs?: number;
  /** Optional opt-in threshold for very short segments. Defaults to 0. */
  minSegmentDurationMs?: number;
}

export interface MotionStartOptions<
  Segment extends MotionSegmentBase<Strategy>,
  Strategy extends string = string,
> {
  segment: Segment;
  sampler: MotionSegmentSampler<Segment, Strategy>;
  onComplete?: (sample: MotionSample<Strategy>) => void;
  completion?: MotionCompletionMode;
  clockStart?: MotionClockStart;
  frameDeltaClamp?: MotionFrameDeltaClamp;
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
