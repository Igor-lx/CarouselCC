// See docs/architecture/state.md
import type { CarouselLayout } from "../domain";
import type { CarouselRuntimeConfig } from "../config";
import { ZERO_GESTURE_RELEASE, type CarouselState } from "./types";

export const buildInitialState = (
  layout: CarouselLayout,
  config: CarouselRuntimeConfig,
  isInstantMode = false,
): CarouselState => ({
  layout,
  config,
  isInstantMode,
  targetPageIndex: 0,
  fromVirtualIndex: 0,
  virtualIndex: 0,
  teleportVirtualIndex: null,
  isTeleportApproach: false,
  isRepeatedClickAdvance: false,
  motionPhase: "idle",
  moveReason: null,
  gesture: ZERO_GESTURE_RELEASE,
});

export const motionStatus = (phase: CarouselState["motionPhase"]) => ({
  isIdle: phase === "idle",
  isMoving: phase !== "idle" && phase !== "dragging",
  isDragging: phase === "dragging",
  isJumping: phase === "step-jump",
});
