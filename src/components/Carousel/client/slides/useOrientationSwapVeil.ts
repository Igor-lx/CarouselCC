import { useEffect, useRef, useState, type RefObject } from "react";

import { useMediaQuery } from "../../../../shared";
import {
  SLIDE_PORTRAIT_MEDIA_CONDITION,
  SLIDE_REORIENT_VEIL_MAX_MS,
} from "../config";

/**
 * Orientation-swap choreography for an art-directed slide image.
 *
 * On a device rotation the slide box flips its aspect instantly (CSS
 * `--slide-aspect`) and the browser re-selects the `<source media>` crop —
 * but until the new crop is fetched and decoded it keeps PAINTING the old
 * bitmap, which `object-fit: cover` shows as a zoomed centre of the previous
 * orientation's photo. This hook masks exactly that window: when the
 * orientation condition flips while a bitmap is on screen, the image is
 * veiled (CSS fade via `data-reorienting`) and unveiled the moment the NEW
 * bitmap is decodable.
 *
 * Self-regulating by construction: `img.decode()` on an in-flight request
 * resolves only after the new crop loads and decodes (slow device — the veil
 * holds as long as needed); on a cached resource it resolves immediately (the
 * veil never becomes visible). The one-frame delay lets the browser's source
 * re-selection — triggered by the same viewport flip, outside React — settle
 * before decoding is observed. Engines without `decode()` fall back to the
 * `load`/`error` events, `complete` covering the already-done race.
 *
 * This is deliberately a VIEW concern (paint masking), not an image-resource
 * store concern: the store models load/error lifecycle per URL; the veil
 * models one repaint race on an already-healthy resource.
 */

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
  const isPortrait = useMediaQuery(SLIDE_PORTRAIT_MEDIA_CONDITION);
  const [isVeiled, setIsVeiled] = useState(false);
  const previousOrientationRef = useRef(isPortrait);

  useEffect(() => {
    if (previousOrientationRef.current === isPortrait) return;
    previousOrientationRef.current = isPortrait;

    const img = imgRef.current;
    if (!isBitmapShown || !img) return;

    let cancelled = false;
    const clear = () => {
      if (!cancelled) setIsVeiled(false);
    };

    setIsVeiled(true);
    // Fail-open: past the cap, the old crop (honest, if zoomed) beats a
    // hidden image — lift the veil and let the swap finish in the open.
    const failOpen = window.setTimeout(clear, SLIDE_REORIENT_VEIL_MAX_MS);
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
  }, [imgRef, isBitmapShown, isPortrait]);

  return isVeiled;
}
