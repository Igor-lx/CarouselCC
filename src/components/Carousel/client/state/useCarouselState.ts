import { useCallback, useMemo, useReducer, useRef } from "react";

import { buildInitialState, motionStatus } from "./initial";
import { reconcileStateToLayout } from "./reconcile";
import { carouselReducer } from "./reducer";
import type {
  CarouselCommand,
  CarouselState,
  ReducerContext,
  ReducerEnvelope,
} from "./types";

export type CarouselDispatch = (command: CarouselCommand) => void;

interface UseCarouselStateResult {
  state: CarouselState;
  status: ReturnType<typeof motionStatus>;
  dispatch: CarouselDispatch;
}

export function useCarouselState({
  layout,
  config,
  isInstantMode,
}: ReducerContext): UseCarouselStateResult {
  const [committedState, dispatchRaw] = useReducer(
    carouselReducer,
    layout,
    buildInitialState,
  );
  const effectiveState = useMemo(
    () => reconcileStateToLayout(committedState, layout),
    [committedState, layout],
  );

  // Layout / config / isInstantMode live in refs so the dispatcher reference
  // stays stable across renders. The reducer reads them via the envelope;
  // they are refreshed during render so a dispatch fired in the same commit
  // still sees the latest values.
  const layoutRef = useRef(layout);
  const configRef = useRef(config);
  const instantRef = useRef(isInstantMode);

  layoutRef.current = layout;
  configRef.current = config;
  instantRef.current = isInstantMode;

  const dispatch = useCallback<CarouselDispatch>((command) => {
    const envelope: ReducerEnvelope = {
      ...command,
      context: {
        layout: layoutRef.current,
        config: configRef.current,
        isInstantMode: instantRef.current,
      },
    };
    dispatchRaw(envelope);
  }, []);

  const status = useMemo(
    () => motionStatus(effectiveState.motionPhase),
    [effectiveState.motionPhase],
  );

  return { state: effectiveState, status, dispatch };
}
