import type { MotionPhase as ControllerPhase } from "../../../shared";
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
  subscribe(listener: VisualPositionListener, options?: { emitCurrent?: boolean }): () => void;
}
