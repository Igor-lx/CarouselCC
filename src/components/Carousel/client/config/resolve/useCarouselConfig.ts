import { useMemo } from "react";

import { buildCarouselConfig } from "./buildConfig";
import type { CarouselRuntimeConfig, RawConfigInput } from "../types";

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
    ],
  );
}
