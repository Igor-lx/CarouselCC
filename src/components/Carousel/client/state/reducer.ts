// See docs/architecture/state.md
import { clamp, normalizePageIndex } from "../domain";
import { resolveGoToApproachDistance } from "../motion/timing";
import { reconcileStateToLayout } from "./reconcile";
import {
  hasReachedDragTarget,
  isSameDirectionRepeat,
  resolveStepTransition,
} from "./transitions";
import {
  ZERO_GESTURE_RELEASE,
  type CarouselState,
  type EndDragCommand,
  type MotionPhase,
  type ReducerCommand,
} from "./types";

const dragReleasePhase = (
  command: EndDragCommand,
  isInstantMode: boolean,
): MotionPhase => {
  if (command.isInstant || isInstantMode) return "step-instant";
  return command.isSnap ? "step-snap" : "step-normal";
};

export function carouselReducer(
  state: CarouselState,
  command: ReducerCommand,
): CarouselState {
  // The context boundary is the reconcile boundary: the host's layout, config
  // and mode land here before any command can act on them, so every branch
  // below reads them off the state it was given.
  // ADR-001, ADR-004.
  if (command.type === "SYNC_CONTEXT") {
    const synced = reconcileStateToLayout(state, command.layout);
    if (
      synced.config === command.config &&
      synced.isInstantMode === command.isInstantMode
    ) {
      return synced;
    }
    return {
      ...synced,
      config: command.config,
      isInstantMode: command.isInstantMode,
    };
  }

  switch (command.type) {
    case "START_DRAG": {
      const dragOrigin = command.fromVirtualIndex ?? state.virtualIndex;
      const dragPageIndex = command.targetPageIndex ?? state.targetPageIndex;
      return {
        ...state,
        targetPageIndex: dragPageIndex,
        fromVirtualIndex: dragOrigin,
        virtualIndex: dragOrigin,
        teleportVirtualIndex: null,
        isTeleportApproach: false,
        isRepeatedClickAdvance: false,
        motionPhase: "dragging",
        moveReason: "gesture",
        gesture: ZERO_GESTURE_RELEASE,
      };
    }

    case "END_DRAG": {
      const dragOrigin = command.fromVirtualIndex ?? state.virtualIndex;
      const targetPageIndex = state.layout.isFinite
        ? clamp(command.targetPageIndex, 0, state.layout.pageCount - 1)
        : normalizePageIndex(command.targetPageIndex, state.layout.pageCount);

      if (
        hasReachedDragTarget(
          dragOrigin,
          command.targetVirtualIndex,
          state.config.dragReleaseEpsilon,
        )
      ) {
        return {
          ...state,
          targetPageIndex,
          fromVirtualIndex: command.targetVirtualIndex,
          virtualIndex: command.targetVirtualIndex,
          teleportVirtualIndex: null,
          isTeleportApproach: false,
          isRepeatedClickAdvance: false,
          motionPhase: "idle",
          moveReason: "gesture",
          gesture: ZERO_GESTURE_RELEASE,
        };
      }

      const releaseGesture =
        command.isInstant || state.isInstantMode
          ? ZERO_GESTURE_RELEASE
          : {
              pointerVelocity: command.pointerReleaseVelocity,
              uiVelocity: command.uiReleaseVelocity,
              launchVelocity: command.launchVelocity,
              releasedAt: command.releasedAt,
            };

      return {
        ...state,
        targetPageIndex,
        fromVirtualIndex: dragOrigin,
        virtualIndex: command.targetVirtualIndex,
        teleportVirtualIndex: null,
        isTeleportApproach: false,
        isRepeatedClickAdvance: false,
        motionPhase: dragReleasePhase(command, state.isInstantMode),
        moveReason: "gesture",
        gesture: releaseGesture,
      };
    }

    case "MOVE":
    case "GO_TO": {
      const isInstant = Boolean(command.isInstant || state.isInstantMode);
      const stepCommand = { ...command, isInstant };

      // Repeated same-direction click during motion (see doc: step resolution).
      const isRepeatedClickAdvance =
        stepCommand.type === "MOVE" &&
        stepCommand.moveReason === "click" &&
        !isInstant &&
        isSameDirectionRepeat(state, stepCommand.step);

      const {
        nextFromVirtualIndex,
        nextTargetPageIndex,
        nextVirtualIndex,
        nextTeleportVirtualIndex,
        phase,
      } = resolveStepTransition(
        state,
        stepCommand,
        state.isInstantMode,
        state.config.motion,
        isRepeatedClickAdvance,
      );

      const isNoop =
        nextTargetPageIndex === state.targetPageIndex &&
        nextVirtualIndex === state.virtualIndex;

      if (isNoop) {
        // Boundary press, or a repeat click still inside the current page: keep
        // the fast-profile flag so the runner rebuilds the active segment.
        return {
          ...state,
          fromVirtualIndex: nextFromVirtualIndex,
          virtualIndex: nextVirtualIndex,
          teleportVirtualIndex: null,
          isTeleportApproach: false,
          isRepeatedClickAdvance,
          motionPhase: isInstant ? "step-instant" : state.motionPhase,
          moveReason: stepCommand.moveReason,
          gesture: ZERO_GESTURE_RELEASE,
        };
      }

      return {
        ...state,
        targetPageIndex: nextTargetPageIndex,
        fromVirtualIndex: nextFromVirtualIndex,
        virtualIndex: nextVirtualIndex,
        teleportVirtualIndex: nextTeleportVirtualIndex,
        isTeleportApproach: false,
        isRepeatedClickAdvance,
        motionPhase: phase,
        moveReason: stepCommand.moveReason,
        gesture: ZERO_GESTURE_RELEASE,
      };
    }

    case "MOTION_SETTLED": {
      if (state.motionPhase === "idle" || state.motionPhase === "dragging") {
        return state;
      }

      const settledPosition = command.settledPosition;
      const targetChanged =
        Math.abs(settledPosition - state.virtualIndex) >
        state.config.motion.epsilon;

      if (targetChanged) {
        // A newer target replaced this one mid-settle: re-anchor, keep motion.
        return {
          ...state,
          fromVirtualIndex: settledPosition,
          teleportVirtualIndex: null,
          isTeleportApproach: false,
          isRepeatedClickAdvance: false,
          gesture: ZERO_GESTURE_RELEASE,
        };
      }

      if (state.teleportVirtualIndex !== null) {
        // Preflight settled: cut across the middle, start the bounded approach.
        const direction = Math.sign(
          state.teleportVirtualIndex - settledPosition,
        );

        if (direction !== 0) {
          const approachDistance = resolveGoToApproachDistance(
            state.layout.visibleSlidesCount,
            state.config.motion,
          );
          return {
            ...state,
            fromVirtualIndex:
              state.teleportVirtualIndex - direction * approachDistance,
            virtualIndex: state.teleportVirtualIndex,
            teleportVirtualIndex: null,
            isTeleportApproach: true,
            isRepeatedClickAdvance: false,
            motionPhase: "step-jump",
            gesture: ZERO_GESTURE_RELEASE,
          };
        }

        // Degenerate: the final target coincides with the preflight landing.
        return {
          ...state,
          fromVirtualIndex: state.teleportVirtualIndex,
          virtualIndex: state.teleportVirtualIndex,
          teleportVirtualIndex: null,
          isTeleportApproach: false,
          isRepeatedClickAdvance: false,
          motionPhase: "idle",
          gesture: ZERO_GESTURE_RELEASE,
        };
      }

      return {
        ...state,
        fromVirtualIndex: settledPosition,
        teleportVirtualIndex: null,
        isTeleportApproach: false,
        isRepeatedClickAdvance: false,
        motionPhase: "idle",
        gesture: ZERO_GESTURE_RELEASE,
      };
    }

    default:
      return state;
  }
}
