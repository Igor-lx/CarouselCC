import { clamp, normalizePageIndex } from "../domain";
import type { CarouselLayout } from "../domain";
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
  type ReducerEnvelope,
} from "./types";

/**
 * ADR-001 — layout reconciliation has one pure rule and two boundaries.
 *
 * `CarouselLayout` is derived from props that change in the render phase
 * without any dispatch (viewport resize, `slidesData` replace, `isFinite`
 * toggle). `useCarouselState` projects the committed reducer state through
 * `reconcileStateToLayout` during render, so runtime consumers immediately see
 * a state/layout pair for the live layout even when no command was dispatched.
 * This reducer applies the same pure reconciler at the command boundary, so
 * the physical transition also starts from the live layout. There is one
 * reconciliation rule and no layout-effect catch-up command.
 */

const dragReleasePhase = (
  command: EndDragCommand,
  isInstantMode: boolean,
): MotionPhase => {
  if (command.isInstant || isInstantMode) return "step-instant";
  return command.isSnap ? "step-snap" : "step-normal";
};

function carouselReducerImpl(
  state: CarouselState,
  envelope: ReducerEnvelope,
): CarouselState {
  const { context } = envelope;
  const synced = reconcileStateToLayout(state, context.layout);

  switch (envelope.type) {
    case "START_DRAG": {
      const dragOrigin = envelope.fromVirtualIndex ?? synced.virtualIndex;
      const dragPageIndex = envelope.targetPageIndex ?? synced.targetPageIndex;
      return {
        ...synced,
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
      const dragOrigin = envelope.fromVirtualIndex ?? synced.virtualIndex;
      const targetPageIndex = synced.layout.isFinite
        ? clamp(envelope.targetPageIndex, 0, synced.layout.pageCount - 1)
        : normalizePageIndex(envelope.targetPageIndex, synced.layout.pageCount);

      if (
        hasReachedDragTarget(
          dragOrigin,
          envelope.targetVirtualIndex,
          context.config.dragReleaseEpsilon,
        )
      ) {
        return {
          ...synced,
          targetPageIndex,
          fromVirtualIndex: envelope.targetVirtualIndex,
          virtualIndex: envelope.targetVirtualIndex,
          teleportVirtualIndex: null,
          isTeleportApproach: false,
          isRepeatedClickAdvance: false,
          motionPhase: "idle",
          moveReason: "gesture",
          gesture: ZERO_GESTURE_RELEASE,
        };
      }

      const releaseGesture =
        envelope.isInstant || context.isInstantMode
          ? ZERO_GESTURE_RELEASE
          : {
              pointerVelocity: envelope.pointerReleaseVelocity,
              uiVelocity: envelope.uiReleaseVelocity,
            };

      return {
        ...synced,
        targetPageIndex,
        fromVirtualIndex: dragOrigin,
        virtualIndex: envelope.targetVirtualIndex,
        teleportVirtualIndex: null,
        isTeleportApproach: false,
        isRepeatedClickAdvance: false,
        motionPhase: dragReleasePhase(envelope, context.isInstantMode),
        moveReason: "gesture",
        gesture: releaseGesture,
      };
    }

    case "MOVE":
    case "GO_TO": {
      const isInstant = Boolean(envelope.isInstant || context.isInstantMode);
      const command = { ...envelope, isInstant };
      const {
        nextFromVirtualIndex,
        nextTargetPageIndex,
        nextVirtualIndex,
        nextTeleportVirtualIndex,
        phase,
      } = resolveStepTransition(
        synced,
        command,
        context.isInstantMode,
        context.config.motion,
      );

      const isRepeatedClickAdvance =
        command.type === "MOVE" &&
        command.moveReason === "click" &&
        !isInstant &&
        isSameDirectionRepeat(synced, command.step);

      const isNoop =
        nextTargetPageIndex === synced.targetPageIndex &&
        nextVirtualIndex === synced.virtualIndex;

      if (isNoop) {
        // Boundary no-ops hold the current phase, or collapse to an instant
        // snap when instant mode is on.
        return {
          ...synced,
          fromVirtualIndex: nextFromVirtualIndex,
          virtualIndex: nextVirtualIndex,
          teleportVirtualIndex: null,
          isTeleportApproach: false,
          isRepeatedClickAdvance: false,
          motionPhase: isInstant ? "step-instant" : synced.motionPhase,
          moveReason: command.moveReason,
          gesture: ZERO_GESTURE_RELEASE,
        };
      }

      return {
        ...synced,
        targetPageIndex: nextTargetPageIndex,
        fromVirtualIndex: nextFromVirtualIndex,
        virtualIndex: nextVirtualIndex,
        teleportVirtualIndex: nextTeleportVirtualIndex,
        isTeleportApproach: false,
        isRepeatedClickAdvance,
        motionPhase: phase,
        moveReason: command.moveReason,
        gesture: ZERO_GESTURE_RELEASE,
      };
    }

    case "MOTION_SETTLED": {
      if (synced.motionPhase === "idle" || synced.motionPhase === "dragging") {
        return synced;
      }

      const settledPosition = envelope.settledPosition;
      const targetChanged =
        Math.abs(settledPosition - synced.virtualIndex) >
        context.config.motion.epsilon;

      if (targetChanged) {
        // A newer click already replaced the target while this segment was
        // settling - re-anchor to where it actually settled, keep motion.
        return {
          ...synced,
          fromVirtualIndex: settledPosition,
          teleportVirtualIndex: null,
          isTeleportApproach: false,
          isRepeatedClickAdvance: false,
          gesture: ZERO_GESTURE_RELEASE,
        };
      }

      if (synced.teleportVirtualIndex !== null) {
        // A far GO_TO's bounded preflight just settled. Teleport across the
        // un-rendered middle and start the fixed approach from a bounded
        // origin, so the render window never spans the full jump.
        const direction = Math.sign(
          synced.teleportVirtualIndex - settledPosition,
        );

        if (direction !== 0) {
          const approachDistance = resolveGoToApproachDistance(
            synced.layout.visibleSlidesCount,
            context.config.motion,
          );
          return {
            ...synced,
            fromVirtualIndex:
              synced.teleportVirtualIndex - direction * approachDistance,
            virtualIndex: synced.teleportVirtualIndex,
            teleportVirtualIndex: null,
            isTeleportApproach: true,
            isRepeatedClickAdvance: false,
            motionPhase: "step-jump",
            gesture: ZERO_GESTURE_RELEASE,
          };
        }

        // Degenerate: the final target coincides with the preflight landing.
        return {
          ...synced,
          fromVirtualIndex: synced.teleportVirtualIndex,
          virtualIndex: synced.teleportVirtualIndex,
          teleportVirtualIndex: null,
          isTeleportApproach: false,
          isRepeatedClickAdvance: false,
          motionPhase: "idle",
          gesture: ZERO_GESTURE_RELEASE,
        };
      }

      return {
        ...synced,
        fromVirtualIndex: settledPosition,
        teleportVirtualIndex: null,
        isTeleportApproach: false,
        isRepeatedClickAdvance: false,
        motionPhase: "idle",
        gesture: ZERO_GESTURE_RELEASE,
      };
    }

    default:
      return synced;
  }
}

/**
 * DEV-only structural invariants on reducer output. They guard reducer-internal
 * transition math (out-of-bounds page index, teleport-phase consistency),
 * independent of how the layout is reconciled. None should ever fire for a
 * correct transition; in production the asserts are stripped and
 * `carouselReducer` is a direct pass-through to `carouselReducerImpl`.
 */
const assertStateInvariants = (
  result: CarouselState,
  layout: CarouselLayout,
): void => {
  if (
    layout.pageCount > 0 &&
    (result.targetPageIndex < 0 || result.targetPageIndex >= layout.pageCount)
  ) {
    console.error(
      "[Carousel] reducer produced an out-of-bounds targetPageIndex.",
      { targetPageIndex: result.targetPageIndex, pageCount: layout.pageCount },
    );
  }
  if (result.teleportVirtualIndex !== null && result.motionPhase !== "step-jump") {
    console.error(
      "[Carousel] teleportVirtualIndex is set outside the step-jump phase.",
      { motionPhase: result.motionPhase },
    );
  }
  if (result.isTeleportApproach && result.motionPhase !== "step-jump") {
    console.error(
      "[Carousel] isTeleportApproach is set outside the step-jump phase.",
      { motionPhase: result.motionPhase },
    );
  }
};

export function carouselReducer(
  state: CarouselState,
  envelope: ReducerEnvelope,
): CarouselState {
  const result = carouselReducerImpl(state, envelope);
  if (import.meta.env.DEV) {
    assertStateInvariants(result, envelope.context.layout);
  }
  return result;
}
