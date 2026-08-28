// See docs/architecture/context.md
import { createContext, useContext } from "react";
import type { CarouselDiagnosticContextValue } from "./types";

export const CarouselDiagnosticContext =
  createContext<CarouselDiagnosticContextValue | null>(null);

export function useCarouselDiagnosticContext(): CarouselDiagnosticContextValue {
  const value = useContext(CarouselDiagnosticContext);
  if (!value) {
    throw new Error("Carousel diagnostic context is missing");
  }
  return value;
}
