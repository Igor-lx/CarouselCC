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
 * ADR-001 — Layout synchronization is a single physical reconcile path.
 *
 * `CarouselLayout` is derived from props that change in the render phase
 * without any dispatch (viewport resize, `slidesData` replace, `isFinite`
 * toggle). Reducer state must stay consistent with the live layout, but the
 * reducer only runs on dispatch.
 *
 * The design: layout changes are turned into an explicit `LAYOUT_SYNC`
 * dispatch fired from a layout-phase effect in `useCarouselState`. The
 * reconciliation itself happens — as for every other command — in
 * `reconcileStateToLayout` at the top of this reducer. There is exactly ONE
 * physical reconcile, and it lives here; no parallel render-time reconcile
 * exists, and `useCarouselState` returns the raw reducer state directly.
 *
 * Because the `LAYOUT_SYNC` dispatch is fired in the layout phase, React
 * flushes the resulting re-render before paint, so consumers never observe a
 * frame with state lagging the layout. `reconcileStateToLayout` must stay
 * idempotent for this to hold — `assertReconcileIdempotent` below guards that
 * in DEV builds.
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
        // MOVE / GO_TO are dispatched only by clicks, controls, and autoplay
        // (gesture dispatches START_DRAG / END_DRAG exclusively). A no-op step
        // therefore just holds the current phase — or collapses to an instant
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

    case "LAYOUT_SYNC":
      // The whole transition is the layout reconciliation already performed
      // by `reconcileStateToLayout` above. See ADR-001.
      return synced;

    default:
      return synced;
  }
}

/**
 * DEV-only guard for ADR-001: re-reconciling a freshly transitioned state
 * against a structurally equivalent layout must not move it. If this fires,
 * `reconcileStateToLayout`'s `sameLayout` fast-path has regressed and the
 * `LAYOUT_SYNC` design no longer holds (a layout change could oscillate).
 */
const assertReconcileIdempotent = (
  result: CarouselState,
  layout: CarouselLayout,
): void => {
  const reSynced = reconcileStateToLayout(result, { ...layout });
  if (
    reSynced.targetPageIndex !== result.targetPageIndex ||
    reSynced.virtualIndex !== result.virtualIndex ||
    reSynced.fromVirtualIndex !== result.fromVirtualIndex ||
    reSynced.motionPhase !== result.motionPhase
  ) {
    console.error(
      "[Carousel] reconcileStateToLayout is not idempotent — " +
        "re-reconciling a settled state against an equivalent layout changed it.",
      { result, reSynced },
    );
  }
};

/**
 * DEV-only structural invariants on reducer output. None of these should ever
 * fire for a correct transition; they catch regressions in transition math
 * before they reach the motion layer.
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

/**
 * The carousel reducer. Pure: every transition is a function of
 * `(state, command, context)`. In DEV builds the result is checked against
 * the ADR-001 idempotency contract and a set of structural invariants; in
 * production the checks are stripped and this is a direct passthrough.
 */
export function carouselReducer(
  state: CarouselState,
  envelope: ReducerEnvelope,
): CarouselState {
  const result = carouselReducerImpl(state, envelope);
  if (import.meta.env.DEV) {
    assertReconcileIdempotent(result, envelope.context.layout);
    assertStateInvariants(result, envelope.context.layout);
  }
  return result;
}
