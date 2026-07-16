import type { MotionPhase as ControllerPhase } from "../../../../shared";
import type { CarouselMotionStrategy } from "../motion/types";

export interface VisualPositionFrame {
  position: number;
  pageOffset: number;
  velocity: number;
  target: number;
  targetPageOffset: number;
  strategy: CarouselMotionStrategy;
  timestamp: number;
  phase: ControllerPhase;
  progress: number;
  /**
   * Index of this emit within the current `"running"` streak; `0` for every
   * resting frame (which also resets the streak). Stamped by the single
   * visual-position source so every subscriber sees the same numbering —
   * the basis of the shared fallback frame-skip (`isDroppedFallbackFrame`):
   * consumers that pace themselves with it drop exactly the same frames.
   */
  runningFrameIndex: number;
}

export type VisualPositionListener = (frame: VisualPositionFrame) => void;

export interface VisualPositionSource {
  /** The last *emitted* visual frame (may lag a live segment by up to one RAF). */
  getSnapshot(): VisualPositionFrame;
  /**
   * The exact current position from the controller's curve at `now()` —
   * reflow-free and, during a live segment, ahead of `getSnapshot()` by the
   * sub-frame elapsed since the last emit. Used for a cold read that *starts* a
   * new segment (gesture press, navigation click) so the new motion begins from
   * where the deck visually is, without reading the DOM.
   */
  sampleNow(): number;
  /**
   * Take the paint back onto the JS frame loop when the external paint owner
   * of a passive segment disappears mid-flight (the track's compositor
   * animation was cancelled by a geometry re-base or rotation). Without it
   * the strip freezes where the animation died and teleports at the settle.
   * A no-op when idle or already ticking.
   */
  wake(): void;
  subscribe(listener: VisualPositionListener, options?: { emitCurrent?: boolean }): () => void;
}
