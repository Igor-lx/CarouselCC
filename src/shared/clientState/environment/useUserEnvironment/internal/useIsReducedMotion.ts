// See ../../README.md
import { useMediaQuery } from "../../../sharedStore/useMediaQuery";

export function useIsReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
