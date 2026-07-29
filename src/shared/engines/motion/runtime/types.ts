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

// See ../README.md — atomic continuation point (one method, one answer).
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

// Optionals here read `?: T | undefined` on purpose: a caller forwarding its own
// optional straight through (`onComplete: props.onSettle`) is the normal shape,
// and under `exactOptionalPropertyTypes` a bare `?:` would reject it.
export interface MotionStartOptions<
  Segment extends MotionSegmentBase<Strategy>,
  Strategy extends string = string,
> {
  segment: Segment;
  sampler: MotionSegmentSampler<Segment, Strategy>;
  onComplete?: ((sample: MotionSample<Strategy>) => void) | undefined;
  completion?: MotionCompletionMode | undefined;
  /** Paint owned elsewhere (a compositor animation): run with NO frame loop,
   * still the position SSOT. See ../README.md § Passive segments. */
  isPassive?: boolean | undefined;
}

export interface MotionSetOptions<Strategy extends string = string> {
  velocity?: number | undefined;
  target?: number | undefined;
  strategy?: Strategy | undefined;
  progress?: number | undefined;
  phase?: MotionPhase | undefined;
}

export interface MotionSnapOptions<Strategy extends string = string>
  extends MotionSetOptions<Strategy> {
  onComplete?: ((sample: MotionSample<Strategy>) => void) | undefined;
  completion?: MotionCompletionMode | undefined;
}

export type MotionSubscriber<Strategy extends string = string> = (
  sample: MotionSample<Strategy>,
) => void;

export interface MotionController<Strategy extends string = string> {
  /** Atomic handoff for starting a new segment — never mix with getSnapshot. */
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
  /** Resume the frame loop for a passive segment whose paint owner vanished
   * (else freeze + teleport at settle). See ../README.md § wake. */
  wake: () => void;
  cancel: () => void;
  destroy: () => void;
}
