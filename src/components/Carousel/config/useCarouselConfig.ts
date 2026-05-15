import { useMemo } from "react";

import { buildRawCarouselConfig } from "./buildRawConfig";
import type { CarouselRuntimeConfig, RawConfigInput } from "./types";

interface UseCarouselConfigInput {
  visibleSlidesNr?: unknown;
  durationAutoplay?: unknown;
  durationStep?: unknown;
  durationJump?: unknown;
  intervalAutoplay?: unknown;
  errAltPlaceholder?: unknown;
}

/**
 * Resolve the runtime config from raw prop input. Defaults are substituted
 * only for `undefined` props (the public default contract). Other values flow
 * through unchanged — invalid input is the caller's responsibility and is
 * surfaced by the diagnostic layer, never repaired here.
 */
export function useCarouselConfig({
  visibleSlidesNr,
  durationAutoplay,
  durationStep,
  durationJump,
  intervalAutoplay,
  errAltPlaceholder,
}: UseCarouselConfigInput): CarouselRuntimeConfig {
  const rawInput = useMemo<RawConfigInput>(
    () => ({
      visibleSlidesNr,
      durationAutoplay,
      durationStep,
      durationJump,
      intervalAutoplay,
      errAltPlaceholder,
    }),
    [
      durationAutoplay,
      durationJump,
      durationStep,
      errAltPlaceholder,
      intervalAutoplay,
      visibleSlidesNr,
    ],
  );

  return useMemo<CarouselRuntimeConfig>(
    () => buildRawCarouselConfig(rawInput),
    [rawInput],
  );
}
