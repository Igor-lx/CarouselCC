// See ./README.md
import { useMemo } from "react";

import { useDataSaver } from "./internal/useDataSaver";
import { useIsReducedMotion } from "./internal/useIsReducedMotion";
import { useIsTouchDevice } from "./internal/useIsTouchDevice";

/** The user-environment signals a UI may react to (one boolean each). */
export interface UserEnvironment {
  reducedMotion: boolean;
  touch: boolean;
  dataSaver: boolean;
}

export function useUserEnvironment(): UserEnvironment {
  const reducedMotion = useIsReducedMotion();
  const touch = useIsTouchDevice();
  const dataSaver = useDataSaver();

  return useMemo<UserEnvironment>(
    () => ({ reducedMotion, touch, dataSaver }),
    [reducedMotion, touch, dataSaver],
  );
}
