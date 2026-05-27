import { createContext } from "react";

import type { ImageResourceStore } from "./types";

/**
 * Carries the per-carousel image status/retry store to rendered slides.
 * `null` means image content is disabled and slides short-circuit to ready.
 */
export const CarouselImageResourceContext =
  createContext<ImageResourceStore | null>(null);
