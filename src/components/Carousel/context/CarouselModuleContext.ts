import { createContext, useContext } from "react";
import type { CarouselModuleContextValue } from "./types";

export const CarouselModuleContext =
  createContext<CarouselModuleContextValue | null>(null);

export function useCarouselModuleContext(): CarouselModuleContextValue {
  const value = useContext(CarouselModuleContext);
  if (!value) {
    throw new Error("Carousel module context is missing — module must render inside a <Carousel>");
  }
  return value;
}
