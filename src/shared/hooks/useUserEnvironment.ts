import { useMemo } from "react";

import { useDataSaver } from "./useDataSaver";
import { useIsReducedMotion } from "../media/useIsReducedMotion";
import { useIsTouchDevice } from "./useIsTouchDevice";

/**
 * The set of user-environment signals a UI may react to. Each is a single
 * boolean so the object stays cheap to compare and memoise.
 */
export interface UserEnvironment {
  /**
   * `prefers-reduced-motion` is active — transitions should snap instantly
   * rather than animate. Accessibility-relevant.
   */
  reducedMotion: boolean;
  /** The device is touch-first (`pointer: coarse`, or an observed touch). */
  touch: boolean;
  /**
   * The user opted into reduced data usage (`prefers-reduced-data` media
   * query, or the Network Information API `saveData` flag).
   */
  dataSaver: boolean;
}

/**
 * Composes the individual environment hooks into one object, intended to be
 * read once at an application boundary and injected into components that take
 * a `userEnvironment` prop (e.g. `<Carousel>`).
 *
 * The result is memoised on the three primitive signals, so its identity
 * changes only when an actual signal flips — never on an unrelated re-render
 * of the host. That keeps it safe to pass straight into a `React.memo`
 * component without defeating the memo boundary.
 *
 * The underlying single-signal hooks (`useIsReducedMotion`, `useIsTouchDevice`,
 * `useDataSaver`) remain individually exported for callers that need just one.
 */
export function useUserEnvironment(): UserEnvironment {
  const reducedMotion = useIsReducedMotion();
  const touch = useIsTouchDevice();
  const dataSaver = useDataSaver();

  return useMemo<UserEnvironment>(
    () => ({ reducedMotion, touch, dataSaver }),
    [reducedMotion, touch, dataSaver],
  );
}
