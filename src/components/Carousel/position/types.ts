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
  getSnapshot(): VisualPositionFrame;
  sampleNow(): number;
  subscribe(listener: VisualPositionListener, options?: { emitCurrent?: boolean }): () => void;
}
