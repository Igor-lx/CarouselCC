import { createContext, useContext } from "react";
import type {
  CarouselMotionContextValue,
  CarouselStructureContextValue,
} from "./types";

/**
 * The module context is split into two providers by update cadence (see
 * `types.ts`). Modules subscribe only to the half they actually read, so a
 * high-frequency motion change never re-renders a structure-only consumer.
 */
export const CarouselStructureContext =
  createContext<CarouselStructureContextValue | null>(null);

export const CarouselMotionContext =
  createContext<CarouselMotionContextValue | null>(null);

const MISSING =
  "Carousel module context is missing — module must render inside a <Carousel>";

/** Stable / low-frequency half: navigation, layout, visual-position source. */
export function useCarouselStructure(): CarouselStructureContextValue {
  const value = useContext(CarouselStructureContext);
  if (!value) throw new Error(MISSING);
  return value;
}

/** High-frequency half: motion status + navigation intent. */
export function useCarouselMotion(): CarouselMotionContextValue {
  const value = useContext(CarouselMotionContext);
  if (!value) throw new Error(MISSING);
  return value;
}
