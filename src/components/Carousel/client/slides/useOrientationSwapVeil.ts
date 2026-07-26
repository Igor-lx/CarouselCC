// Masks the stale-crop repaint race on rotation (a VIEW concern, not the
// resource store's). See docs/architecture/slides.md
import { useEffect, useRef, useState, type RefObject } from "react";

import { SLIDE_REORIENT_VEIL } from "../config";
import { useSlideViewport } from "../viewport/useSlideViewport";

interface UseOrientationSwapVeilInput {
  /** The live `<img>`; stays `null` for text slides and error placeholders. */
  imgRef: RefObject<HTMLImageElement | null>;
  /** Only a shown bitmap can display the stale-crop artefact. */
  isBitmapShown: boolean;
}

export function useOrientationSwapVeil({
  imgRef,
  isBitmapShown,
}: UseOrientationSwapVeilInput): boolean {
  // Any flip that can re-select a <source media> crop changes this signature.
  const { signature } = useSlideViewport();
  const [isVeiled, setIsVeiled] = useState(false);
  const previousSignatureRef = useRef(signature);

  useEffect(() => {
    if (previousSignatureRef.current === signature) return;
    previousSignatureRef.current = signature;

    const img = imgRef.current;
    if (!isBitmapShown || !img) return;

    let cancelled = false;
    const clear = () => {
      if (!cancelled) setIsVeiled(false);
    };

    setIsVeiled(true);
    // Fail-open past the cap: an honest (if zoomed) crop beats a hidden image.
    const failOpen = window.setTimeout(clear, SLIDE_REORIENT_VEIL.veilMaxMs);
    const frame = requestAnimationFrame(() => {
      const element = imgRef.current;
      if (!element) {
        clear();
        return;
      }
      if (typeof element.decode === "function") {
        element.decode().then(clear, clear);
      } else if (element.complete) {
        clear();
      } else {
        element.addEventListener("load", clear, { once: true });
        element.addEventListener("error", clear, { once: true });
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(failOpen);
    };
  }, [imgRef, isBitmapShown, signature]);

  return isVeiled;
}
