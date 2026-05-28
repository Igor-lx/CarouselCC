import { useMemo } from "react";

import { useDataSaver } from "./useDataSaver";
import { useIsReducedMotion } from "./useIsReducedMotion";
import { useIsTouchDevice } from "./useIsTouchDevice";

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
