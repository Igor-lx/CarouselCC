import { useMediaQuery } from "../../shared/useMediaQuery";

export function useIsReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
