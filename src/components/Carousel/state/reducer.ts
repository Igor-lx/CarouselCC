import { clamp, normalizePageIndex } from "../domain";
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

      // A repeated click (a same-direction MOVE click while motion is
      // running) does not get a special destination — it steps to the next
      // page boundary like any click. The flag only tells the motion layer
      // to use the fast acceleration profile for this segment.
      const isRepeatedClickAdvance =
        command.type === "MOVE" &&
        command.moveReason === "click" &&
        !isInstant &&
        isSameDirectionRepeat(synced, command.step);

      const isNoop =
        nextTargetPageIndex === synced.targetPageIndex &&
        nextVirtualIndex === synced.virtualIndex;

      if (isNoop) {
        if (command.moveReason === "gesture") {
          return {
            ...synced,
            fromVirtualIndex: nextFromVirtualIndex,
            isRepeatedClickAdvance: false,
            motionPhase: "step-snap",
            moveReason: "gesture",
            gesture: ZERO_GESTURE_RELEASE,
          };
        }
        return {
          ...synced,
          fromVirtualIndex: nextFromVirtualIndex,
          virtualIndex: nextVirtualIndex,
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

      // The carousel stopped where the *active* segment was aimed
      // (`settledPosition`), but the latest `state.virtualIndex` is a
      // different target — a click landed after the segment had started
      // settling but before this MOTION_SETTLED dispatch reached the
      // reducer. We do not snap to the new target (that is what produced the
      // "land short, freeze, jump" artefact); we re-anchor `fromVirtualIndex`
      // to the actual settled position and leave `motionPhase` non-idle so
      // the next motion-runner pass animates from there to the still-pending
      // `virtualIndex`.
      if (targetChanged) {
        return {
          ...synced,
          fromVirtualIndex: settledPosition,
          isRepeatedClickAdvance: false,
          gesture: ZERO_GESTURE_RELEASE,
        };
      }

      return {
        ...synced,
        activePageIndex: synced.targetPageIndex,
        fromVirtualIndex: settledPosition,
        isRepeatedClickAdvance: false,
        motionPhase: "idle",
        gesture: ZERO_GESTURE_RELEASE,
      };
    }

    default:
      return synced;
  }
}
