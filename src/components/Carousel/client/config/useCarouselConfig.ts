import { useMemo } from "react";

import { buildCarouselConfig } from "./buildConfig";
import type { CarouselRuntimeConfig, RawConfigInput } from "./types";

/**
 * Resolve the runtime config from raw prop input. Defaults are substituted
 * only for `undefined` props (the public default contract). Other values flow
 * through unchanged - invalid input is the caller's responsibility and is
 * surfaced by the diagnostic layer, never repaired here.
 */
export function useCarouselConfig({
  visibleSlidesNr,
  durationAutoplay,
  durationStep,
  intervalAutoplay,
  errAltPlaceholder,
}: RawConfigInput): CarouselRuntimeConfig {
  return useMemo<CarouselRuntimeConfig>(
    () =>
      buildCarouselConfig({
        visibleSlidesNr,
        durationAutoplay,
        durationStep,
        intervalAutoplay,
        errAltPlaceholder,
      }),
    [
      durationAutoplay,
      durationStep,
      errAltPlaceholder,
      intervalAutoplay,
      visibleSlidesNr,
    ]
  );
}
