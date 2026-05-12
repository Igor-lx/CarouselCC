import { isValidElement, useMemo, type ReactNode } from "react";
import type { DevNoticeEntry } from "../../../shared";
import { buildRawCarouselConfig } from "./buildRawConfig";
import type {
  CarouselDiagnosticResolver,
  CarouselRuntimeConfig,
  RawConfigInput,
} from "./types";

interface UseCarouselConfigInput {
  diagnosticSlot: ReactNode;
  visibleSlidesNr?: unknown;
  durationAutoplay?: unknown;
  durationStep?: unknown;
  durationJump?: unknown;
  intervalAutoplay?: unknown;
  errAltPlaceholder?: unknown;
  isTouch: boolean;
}

export interface CarouselResolvedConfig {
  config: CarouselRuntimeConfig;
  notices: DevNoticeEntry[];
}

/**
 * Resolve the runtime config for the carousel. When a Diagnostic slot is
 * attached and exposes a `resolveDiagnostic` static, the resolver takes over
 * and may produce normalised values and dev notices. Otherwise the raw safe
 * defaults are used.
 *
 * The touch-aware adjustment of `repeatedClick.destinationPosition` happens
 * here so the rest of the system sees a single resolved value.
 */
export function useCarouselConfig({
  diagnosticSlot,
  visibleSlidesNr,
  durationAutoplay,
  durationStep,
  durationJump,
  intervalAutoplay,
  errAltPlaceholder,
  isTouch,
}: UseCarouselConfigInput): CarouselResolvedConfig {
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

  const diagnosticResolver = useMemo<CarouselDiagnosticResolver | null>(() => {
    if (!isValidElement(diagnosticSlot)) return null;
    const resolver = (
      diagnosticSlot.type as { resolveDiagnostic?: CarouselDiagnosticResolver }
    ).resolveDiagnostic;
    return typeof resolver === "function" ? resolver : null;
  }, [diagnosticSlot]);

  const resolved = useMemo<CarouselResolvedConfig>(() => {
    const fromResolver = diagnosticResolver?.(rawInput);
    if (fromResolver) {
      return {
        config: fromResolver.config,
        notices: fromResolver.notices,
      };
    }
    return {
      config: buildRawCarouselConfig(rawInput),
      notices: [],
    };
  }, [diagnosticResolver, rawInput]);

  return useMemo<CarouselResolvedConfig>(() => {
    const base = resolved.config;
    const destinationPosition = isTouch
      ? base.repeatedClick.touchDestinationPosition
      : base.repeatedClick.destinationPosition;

    if (destinationPosition === base.repeatedClick.destinationPosition) {
      return resolved;
    }

    return {
      config: {
        ...base,
        repeatedClick: {
          ...base.repeatedClick,
          destinationPosition,
        },
      },
      notices: resolved.notices,
    };
  }, [isTouch, resolved]);
}
