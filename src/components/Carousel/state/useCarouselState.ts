import { useCallback, useMemo, useReducer, useRef } from "react";

import { useIsomorphicLayoutEffect } from "../../../shared";
import type { CarouselLayout } from "../domain";
import type { CarouselRuntimeConfig } from "../config";
import { buildInitialState, motionStatus } from "./initial";
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
  const [state, dispatchRaw] = useReducer(
    carouselReducer,
    layout,
    buildInitialState,
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

  // ADR-001: layout changes are propagated into reducer state through an
  // explicit LAYOUT_SYNC dispatch — the single physical reconcile lives in
  // the reducer (`reconcileStateToLayout`), not in a parallel render-time
  // memo. The dispatch is fired in the layout phase, so React flushes the
  // synced re-render before paint and no stale-layout frame is ever shown.
  // `syncedLayoutRef` starts at the mount layout, so the initial state
  // (already built from `layout`) does not trigger a redundant first sync.
  const syncedLayoutRef = useRef(layout);
  useIsomorphicLayoutEffect(() => {
    if (syncedLayoutRef.current === layout) return;
    syncedLayoutRef.current = layout;
    dispatch({ type: "LAYOUT_SYNC" });
  }, [dispatch, layout]);

  const status = useMemo(
    () => motionStatus(state.motionPhase),
    [state.motionPhase],
  );

  return { state, status, dispatch };
}
