// See docs/architecture/state.md
import { useMemo, useReducer } from "react";

import { buildInitialState, motionStatus } from "./initial";
import { carouselReducer } from "./reducer";
import type { CarouselCommand, CarouselState, ReducerContext } from "./types";

export type CarouselDispatch = (command: CarouselCommand) => void;

interface UseCarouselStateResult {
  state: CarouselState;
  status: ReturnType<typeof motionStatus>;
  dispatch: CarouselDispatch;
}

const initialise = ({ layout, config, isInstantMode }: ReducerContext) =>
  buildInitialState(layout, config, isInstantMode);

export function useCarouselState(
  context: ReducerContext,
): UseCarouselStateResult {
  const [state, dispatch] = useReducer(carouselReducer, context, initialise);
  const { layout, config, isInstantMode } = context;

  // The reducer owns its context, so it is committed here — during render, and
  // therefore before any child can dispatch — instead of riding along on every
  // command. `dispatch` needs no refs to stay stable, and nothing can read a
  // layout the state was not reconciled against.
  // See docs/adr/0004-reducer-owns-its-context.md.
  if (
    state.layout !== layout ||
    state.config !== config ||
    state.isInstantMode !== isInstantMode
  ) {
    dispatch({ type: "SYNC_CONTEXT", layout, config, isInstantMode });
  }

  const status = useMemo(
    () => motionStatus(state.motionPhase),
    [state.motionPhase],
  );

  return { state, status, dispatch };
}
