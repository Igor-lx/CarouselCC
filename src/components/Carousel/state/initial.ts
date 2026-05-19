import type { CarouselLayout } from "../domain";
import { ZERO_GESTURE_RELEASE, type CarouselState } from "./types";

export const buildInitialState = (layout: CarouselLayout): CarouselState => ({
  layout,
  targetPageIndex: 0,
  fromVirtualIndex: 0,
  virtualIndex: 0,
  teleportVirtualIndex: null,
  isTeleportApproach: false,
  isRepeatedClickAdvance: false,
  motionPhase: "idle",
  moveReason: "unknown",
  gesture: ZERO_GESTURE_RELEASE,
});

export const motionStatus = (phase: CarouselState["motionPhase"]) => ({
  isIdle: phase === "idle",
  isMoving: phase !== "idle" && phase !== "dragging",
  isDragging: phase === "dragging",
  isJumping: phase === "step-jump",
  isSnapping: phase === "step-snap",
  isInstant: phase === "step-instant",
  isAnimating:
    phase === "step-normal" ||
    phase === "step-jump" ||
    phase === "step-snap",
});
