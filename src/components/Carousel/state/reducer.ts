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

export function carouselReducer(
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

      // Bounded repeated click: a same-direction MOVE click that arrives while
      // the deck is already animating only flags the active segment for the
      // fast-repeat profile — it does not push the destination further. The
      // pending `targetPageIndex` already names the next page in this
      // direction, so rapid clicks cannot get the deck more than one page
      // ahead of where it is animating right now. Reverse-direction clicks
      // and clicks from idle fall through to the normal advance path below.
      if (
        command.type === "MOVE" &&
        command.moveReason === "click" &&
        !isInstant &&
        isSameDirectionRepeat(synced, command.step)
      ) {
        if (synced.isRepeatedClickAdvance) return synced;
        return {
          ...synced,
          isRepeatedClickAdvance: true,
          gesture: ZERO_GESTURE_RELEASE,
        };
      }

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
        isRepeatedClickAdvance: false,
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
