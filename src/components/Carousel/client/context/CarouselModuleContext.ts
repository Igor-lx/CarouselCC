import { createContext, useContext } from "react";
import type {
  CarouselMotionContextValue,
  CarouselStableContextValue,
} from "./types";

/**
 * The module context is split into two providers by update cadence (see
 * `types.ts`). Modules subscribe only to the half they actually read, so a
 * high-frequency motion change never re-renders a stable-only consumer.
 */
export const CarouselStableContext =
  createContext<CarouselStableContextValue | null>(null);

export const CarouselMotionContext =
  createContext<CarouselMotionContextValue | null>(null);

const MISSING =
  "Carousel module context is missing — module must render inside a <Carousel>";

/** Stable / low-frequency half: navigation, layout, visual-position source. */
export function useCarouselStable(): CarouselStableContextValue {
  const value = useContext(CarouselStableContext);
  if (!value) throw new Error(MISSING);
  return value;
}

/** High-frequency half: motion status + navigation intent. */
export function useCarouselMotion(): CarouselMotionContextValue {
  const value = useContext(CarouselMotionContext);
  if (!value) throw new Error(MISSING);
  return value;
}
