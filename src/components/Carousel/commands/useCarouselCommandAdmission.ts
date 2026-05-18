import { useCallback, useEffect, useMemo, useRef } from "react";

import { useIsomorphicLayoutEffect, type MotionController } from "../../../shared";
import type {
  CarouselDispatch,
  CarouselState,
  EndDragCommand,
  GoToCommand,
  MoveReason,
  StartDragCommand,
} from "../state";
import { isSameDirectionRepeat } from "../state/transitions";
import type { CarouselMotionStrategy } from "../motion/types";

/**
 * Raw repeated clicks are admitted only after a small frame-boundary buffer.
 * The currently active segment keeps painting while same-burst clicks are
 * coalesced into one accepted MOVE command.
 */
const REPEATED_CLICK_ADMISSION_FRAME_DELAY = 2;

interface UseCarouselCommandAdmissionInput {
  state: CarouselState;
  dispatch: CarouselDispatch;
  controller: MotionController<CarouselMotionStrategy>;
  enabled: boolean;
  readCurrentPosition: () => number;
}

export interface CarouselCommands {
  move: (step: number, reason?: MoveReason) => void;
  goTo: (pageIndex: number, reason?: MoveReason) => void;
  startDrag: (command: Omit<StartDragCommand, "type">) => void;
  endDrag: (command: Omit<EndDragCommand, "type">) => void;
}

/**
 * Single admission gateway from raw interaction intent into accepted reducer
 * commands.
 *
 * The reducer remains the SSOT for accepted logical state. This hook owns only
 * pre-state command admission: immediate commands pass through, while
 * same-direction repeated clicks are briefly buffered and coalesced before a
 * single accepted MOVE is dispatched.
 */
export function useCarouselCommandAdmission({
  state,
  dispatch,
  controller,
  enabled,
  readCurrentPosition,
}: UseCarouselCommandAdmissionInput): CarouselCommands {
  const stateRef = useRef(state);
  const pendingStepRef = useRef(0);
  const admissionFrameRef = useRef<number | null>(null);
  const admissionTokenRef = useRef(0);

  stateRef.current = state;

  const cancelPendingRepeatedClicks = useCallback(() => {
    admissionTokenRef.current += 1;
    pendingStepRef.current = 0;

    if (admissionFrameRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(admissionFrameRef.current);
    }
    admissionFrameRef.current = null;
  }, []);

  const acceptPendingRepeatedClicks = useCallback(() => {
    admissionFrameRef.current = null;

    const step = pendingStepRef.current;
    pendingStepRef.current = 0;
    if (step === 0) return;

    dispatch({
      type: "MOVE",
      step,
      moveReason: "click",
      fromVirtualIndex: controller.getSnapshot().value,
    });
  }, [controller, dispatch]);

  const scheduleAdmission = useCallback(() => {
    if (admissionFrameRef.current !== null) return;

    if (typeof window === "undefined") {
      acceptPendingRepeatedClicks();
      return;
    }

    const token = ++admissionTokenRef.current;
    let framesLeft = REPEATED_CLICK_ADMISSION_FRAME_DELAY;

    const tick: FrameRequestCallback = () => {
      if (admissionTokenRef.current !== token) return;

      framesLeft -= 1;
      if (framesLeft > 0) {
        admissionFrameRef.current = window.requestAnimationFrame(tick);
        return;
      }

      acceptPendingRepeatedClicks();
    };

    admissionFrameRef.current = window.requestAnimationFrame(tick);
  }, [acceptPendingRepeatedClicks]);

  const tryQueueRepeatedClickMove = useCallback(
    (step: number): boolean => {
      if (!enabled || step === 0) return false;

      const hasPendingBurst = pendingStepRef.current !== 0;
      const mayStartRepeatedBurst =
        controller.isActive() && isSameDirectionRepeat(stateRef.current, step);

      if (!hasPendingBurst && !mayStartRepeatedBurst) return false;

      pendingStepRef.current += step;

      if (pendingStepRef.current === 0) {
        cancelPendingRepeatedClicks();
        return true;
      }

      scheduleAdmission();
      return true;
    },
    [cancelPendingRepeatedClicks, controller, enabled, scheduleAdmission],
  );

  const move = useCallback(
    (step: number, reason: MoveReason = "unknown") => {
      if (!enabled) return;
      if (reason === "click" && tryQueueRepeatedClickMove(step)) return;

      cancelPendingRepeatedClicks();
      dispatch({
        type: "MOVE",
        step,
        moveReason: reason,
        fromVirtualIndex: readCurrentPosition(),
      });
    },
    [
      cancelPendingRepeatedClicks,
      dispatch,
      enabled,
      readCurrentPosition,
      tryQueueRepeatedClickMove,
    ],
  );

  const goTo = useCallback(
    (pageIndex: number, reason: MoveReason = "unknown") => {
      if (!enabled) return;

      cancelPendingRepeatedClicks();
      const command: GoToCommand = {
        type: "GO_TO",
        targetPageIndex: pageIndex,
        moveReason: reason,
        fromVirtualIndex: readCurrentPosition(),
      };
      dispatch(command);
    },
    [cancelPendingRepeatedClicks, dispatch, enabled, readCurrentPosition],
  );

  const startDrag = useCallback(
    (command: Omit<StartDragCommand, "type">) => {
      if (!enabled) return;
      cancelPendingRepeatedClicks();
      dispatch({ type: "START_DRAG", ...command });
    },
    [cancelPendingRepeatedClicks, dispatch, enabled],
  );

  const endDrag = useCallback(
    (command: Omit<EndDragCommand, "type">) => {
      if (!enabled) return;
      cancelPendingRepeatedClicks();
      dispatch({ type: "END_DRAG", ...command });
    },
    [cancelPendingRepeatedClicks, dispatch, enabled],
  );

  useIsomorphicLayoutEffect(() => {
    if (!enabled || state.motionPhase === "dragging") {
      cancelPendingRepeatedClicks();
    }
  }, [cancelPendingRepeatedClicks, enabled, state.motionPhase]);

  useEffect(
    () => () => {
      cancelPendingRepeatedClicks();
    },
    [cancelPendingRepeatedClicks],
  );

  return useMemo(
    () => ({ move, goTo, startDrag, endDrag }),
    [endDrag, goTo, move, startDrag],
  );
}
