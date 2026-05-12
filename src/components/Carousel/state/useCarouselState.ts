import { useCallback, useMemo, useReducer, useRef } from "react";

import type { CarouselLayout } from "../domain";
import type { CarouselRuntimeConfig } from "../config";
import { buildInitialState, motionStatus } from "./initial";
import { carouselReducer } from "./reducer";
import { reconcileStateToLayout } from "./reconcile";
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
  const [rawState, dispatchRaw] = useReducer(
    carouselReducer,
    layout,
    buildInitialState,
  );

  // Layout / config / isInstantMode live in refs so the dispatcher reference
  // stays stable across renders. The reducer reads them via the envelope.
  const layoutRef = useRef(layout);
  const configRef = useRef(config);
  const instantRef = useRef(isInstantMode);

  layoutRef.current = layout;
  configRef.current = config;
  instantRef.current = isInstantMode;

  const state = useMemo(
    () => reconcileStateToLayout(rawState, layout),
    [rawState, layout],
  );

  const status = useMemo(() => motionStatus(state.motionPhase), [state.motionPhase]);

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

  return { state, status, dispatch };
}
