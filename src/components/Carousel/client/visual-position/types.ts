// See docs/architecture/visual-position.md
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
  /** Index within the current `"running"` streak (0 on any resting frame). */
  runningFrameIndex: number;
}

export type VisualPositionListener = (frame: VisualPositionFrame) => void;

export interface VisualPositionSource {
  /** The last EMITTED frame (may lag a live segment by up to one RAF). */
  getSnapshot(): VisualPositionFrame;
  /** Exact curve position at `now()`, reflow-free — the cold-read origin. */
  sampleNow(): number;
  /** Take paint back onto the JS loop when a passive segment's owner vanishes. */
  wake(): void;
  subscribe(
    listener: VisualPositionListener,
    options?: { emitCurrent?: boolean },
  ): () => void;
}
