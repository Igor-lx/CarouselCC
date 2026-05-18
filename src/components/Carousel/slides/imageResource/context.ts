import { createContext } from "react";

import type { ImageResourceStore } from "./types";

/**
 * Carries the per-carousel image-resource store to the slide subtree.
 *
 * The value is `null` when `isContentImg` is off: in that mode no store is
 * created and no image machinery runs at all. Each image slide reads the
 * store through `useImageResource`, subscribing only to its own URL.
 */
export const CarouselImageResourceContext =
  createContext<ImageResourceStore | null>(null);
