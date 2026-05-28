import { useMemo } from "react";

import { buildRawCarouselConfig } from "./buildRawConfig";
import type { CarouselRuntimeConfig } from "./types";

interface UseCarouselConfigInput {
  visibleSlidesNr?: unknown;
  durationAutoplay?: unknown;
  durationStep?: unknown;
  jumpSpeedMultiplier?: unknown;
  intervalAutoplay?: unknown;
  errAltPlaceholder?: unknown;
}

export function useCarouselConfig({
  visibleSlidesNr,
  durationAutoplay,
  durationStep,
  jumpSpeedMultiplier,
  intervalAutoplay,
  errAltPlaceholder,
}: UseCarouselConfigInput): CarouselRuntimeConfig {
  return useMemo<CarouselRuntimeConfig>(
    () =>
      buildRawCarouselConfig({
        visibleSlidesNr,
        durationAutoplay,
        durationStep,
        jumpSpeedMultiplier,
        intervalAutoplay,
        errAltPlaceholder,
      }),
    [
      durationAutoplay,
      durationStep,
      errAltPlaceholder,
      intervalAutoplay,
      jumpSpeedMultiplier,
      visibleSlidesNr,
    ],
  );
}
