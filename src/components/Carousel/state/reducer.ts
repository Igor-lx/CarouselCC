import { clamp, normalizePageIndex } from "../domain";
import { reconcileStateToLayout } from "./reconcile";
import {
  hasReachedDragTarget,
  resolveRepeatedClickPlan,
  resolveStepTransition,
} from "./transitions";
import {
  ZERO_GESTURE_RELEASE,
  type CarouselState,
  type EndDragCommand,
  type MotionPhase,
  type ReducerEnvelope,
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
        activePageIndex: dragPageIndex,
        targetPageIndex: dragPageIndex,
        fromVirtualIndex: dragOrigin,
        virtualIndex: dragOrigin,
        followUpVirtualIndex: null,
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
          activePageIndex: targetPageIndex,
          targetPageIndex,
          fromVirtualIndex: envelope.targetVirtualIndex,
          virtualIndex: envelope.targetVirtualIndex,
          followUpVirtualIndex: null,
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
        followUpVirtualIndex: null,
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
        phase,
      } = resolveStepTransition(synced, command, context.isInstantMode);

      const repeatedPlan =
        command.type === "MOVE" &&
        command.moveReason === "click" &&
        !isInstant &&
        Math.abs(command.step) > 0
          ? resolveRepeatedClickPlan({
              state: synced,
              fromVirtualIndex: nextFromVirtualIndex,
              step: command.step,
              repeated: context.config.repeatedClick,
            })
          : null;

      const plannedTargetPageIndex =
        repeatedPlan?.nextTargetPageIndex ?? nextTargetPageIndex;
      const followUpVirtualIndex = repeatedPlan?.followUpVirtualIndex ?? null;
      const plannedVirtualIndex =
        repeatedPlan?.nextAdvanceVirtualIndex ?? nextVirtualIndex;

      const isNoop =
        repeatedPlan === null &&
        plannedTargetPageIndex === synced.targetPageIndex &&
        plannedVirtualIndex === synced.virtualIndex &&
        followUpVirtualIndex === null;

      if (isNoop) {
        if (command.moveReason === "gesture") {
          return {
            ...synced,
            fromVirtualIndex: nextFromVirtualIndex,
            followUpVirtualIndex: null,
            isRepeatedClickAdvance: false,
            motionPhase: "step-snap",
            moveReason: "gesture",
            gesture: ZERO_GESTURE_RELEASE,
          };
        }
        return {
          ...synced,
          fromVirtualIndex: nextFromVirtualIndex,
          virtualIndex: plannedVirtualIndex,
          followUpVirtualIndex: null,
          isRepeatedClickAdvance: false,
          motionPhase: isInstant ? "step-instant" : synced.motionPhase,
          moveReason: command.moveReason,
          gesture: ZERO_GESTURE_RELEASE,
        };
      }

      return {
        ...synced,
        targetPageIndex: plannedTargetPageIndex,
        fromVirtualIndex: nextFromVirtualIndex,
        virtualIndex: plannedVirtualIndex,
        followUpVirtualIndex,
        isRepeatedClickAdvance: repeatedPlan !== null,
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

      // The carousel stopped where the *active* segment was aimed
      // (`settledPosition`), but the latest `state.virtualIndex` is a
      // different target — meaning a click landed after the segment had
      // started settling but before this MOTION_SETTLED dispatch reached the
      // reducer. We don't snap to the new target (that's what produces the
      // "land short, freeze, jump" artefact); we re-anchor `fromVirtualIndex`
      // to the actual settled position and let the next motion-runner pass
      // animate from there to the still-pending `virtualIndex`. The chain
      // follow-up (`followUpVirtualIndex`) stays untouched for the same
      // reason — it must fire only after we've actually reached the
      // (now-redirected) advance target.
      if (targetChanged) {
        return {
          ...synced,
          fromVirtualIndex: settledPosition,
          isRepeatedClickAdvance: false,
          gesture: ZERO_GESTURE_RELEASE,
        };
      }

      if (synced.followUpVirtualIndex !== null) {
        return {
          ...synced,
          fromVirtualIndex: settledPosition,
          virtualIndex: synced.followUpVirtualIndex,
          followUpVirtualIndex: null,
          isRepeatedClickAdvance: false,
          motionPhase: "step-normal",
          moveReason: "click",
          gesture: ZERO_GESTURE_RELEASE,
        };
      }

      return {
        ...synced,
        activePageIndex: synced.targetPageIndex,
        fromVirtualIndex: settledPosition,
        followUpVirtualIndex: null,
        isRepeatedClickAdvance: false,
        motionPhase: "idle",
        gesture: ZERO_GESTURE_RELEASE,
      };
    }

    default:
      return synced;
  }
}
