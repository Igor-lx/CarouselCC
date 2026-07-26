// See docs/architecture/slides.md
import type { CarouselSlideRecord } from "../../domain";
import type { ImageResourceStore } from "./types";
import { useImageResourceRetention } from "./useImageResourceRetention";
import { useImageResourceStoreInstance } from "./useImageResourceStoreInstance";

interface UseImageResourceStoreInput {
  isContentImg: boolean;
  records: CarouselSlideRecord[];
  /** The store keys on the RENDERED src (mirrors the slide renderer). */
  isResponsiveImagesOn: boolean;
}

/** The one call that owns the store's lifecycle + retention for a carousel. */
export function useImageResourceStore({
  isContentImg,
  records,
  isResponsiveImagesOn,
}: UseImageResourceStoreInput): ImageResourceStore | null {
  const store = useImageResourceStoreInstance(isContentImg);
  useImageResourceRetention({ store, records, isContentImg, isResponsiveImagesOn });
  return store;
}
