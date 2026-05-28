import { useCallback, useMemo, useReducer, useRef } from "react";

import type { CarouselLayout } from "../domain";
import type { CarouselRuntimeConfig } from "../config";
import { buildInitialState, motionStatus } from "./initial";
import { reconcileStateToLayout } from "./reconcile";
import { carouselReducer } from "./reducer";
import type {
  CarouselCommand,
  CarouselState,
  ReducerEnvelope,
} from "./types";

interface UseCarouselStateInput {
  layout: CarouselLayout;
  config: CarouselRuntimeConfig;
  isInstantMode: boolean;
}

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
}: UseCarouselStateInput): UseCarouselStateResult {
  const [committedState, dispatchRaw] = useReducer(
    carouselReducer,
    layout,
    buildInitialState,
  );
  const effectiveState = useMemo(
    () => reconcileStateToLayout(committedState, layout),
    [committedState, layout],
  );

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
