import type { CarouselSlideRecord } from "../../domain";
import type { ImageResourceStore } from "./types";
import { useImageResourceRetention } from "./useImageResourceRetention";
import { useImageResourceStoreInstance } from "./useImageResourceStoreInstance";

interface UseImageResourceStoreInput {
  isContentImg: boolean;
  records: CarouselSlideRecord[];
  /** Mirrors the slide renderer: the store keys on the RENDERED src. */
  isResponsiveImagesOn: boolean;
}

/**
 * The ONE call that owns everything store-related for a carousel instance:
 * the store's lifecycle (created lazily when image content is on, `null` and
 * inert otherwise, soft-disposed on unmount) and its retention (entries and
 * their retry timers pruned to the live deck on every data change). The
 * composition root receives just the managed store and threads it explicitly
 * into each `SlideItem`; the two concerns stay separate modules underneath.
 */
export function useImageResourceStore({
  isContentImg,
  records,
  isResponsiveImagesOn,
}: UseImageResourceStoreInput): ImageResourceStore | null {
  const store = useImageResourceStoreInstance(isContentImg);
  useImageResourceRetention({ store, records, isContentImg, isResponsiveImagesOn });
  return store;
}
