// Masks the stale-crop repaint race on rotation (a VIEW concern, not the
// resource store's). See docs/architecture/slides.md
import { useEffect, useRef, useState, type RefObject } from "react";

import { SLIDE_REORIENT_VEIL } from "../config";

interface UseOrientationSwapVeilInput {
  /** The live `<img>`; stays `null` for text slides and error placeholders. */
  imgRef: RefObject<HTMLImageElement | null>;
  /** Only a shown bitmap can display the stale-crop artefact. */
  isBitmapShown: boolean;
  /**
   * The viewport signature, read ONCE at the composition root and handed down.
   * Any flip that can re-select a `<source media>` crop changes it. Calling the
   * media facade here instead would put N media subscriptions and one MediaState
   * rebuild on EVERY mounted slide (a render window is tens of them) to read a
   * single scalar — see docs/architecture/viewport.md.
   */
  viewportSignature: string;
}

export function useOrientationSwapVeil({
  imgRef,
  isBitmapShown,
  viewportSignature: signature,
}: UseOrientationSwapVeilInput): boolean {
  const [isVeiled, setIsVeiled] = useState(false);
  const previousSignatureRef = useRef(signature);

  useEffect(() => {
    if (previousSignatureRef.current === signature) return;
    previousSignatureRef.current = signature;

    const img = imgRef.current;
    if (!isBitmapShown || !img) return;

    let cancelled = false;
    let detachReveal: (() => void) | null = null;
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
        detachReveal = () => {
          element.removeEventListener("load", clear);
          element.removeEventListener("error", clear);
        };
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(failOpen);
      detachReveal?.();
      // Teardown takes the fail-open timer with it, so the veil has to come
      // down HERE or it never does: the guard above returns on an unchanged
      // signature, and a re-run would leave the slide masked for good.
      setIsVeiled(false);
    };
  }, [imgRef, isBitmapShown, signature]);

  return isVeiled;
}
