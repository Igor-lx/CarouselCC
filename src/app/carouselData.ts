/**
 * The demo data set is split into `carouselData.desktop.ts` and
 * `carouselData.mobile.ts` so the bundler emits each variant as its own
 * dynamically-imported chunk. The initial app bundle only carries the
 * picker function below — the 12 image URLs and their static `import`s
 * stay in whichever chunk is actually fetched. On a desktop session the
 * mobile chunk is never downloaded, and vice versa.
 */
export interface CarouselSourceRecord {
  id: string;
  content: string;
}

export const loadCarouselSources = async (
  isMobileImagery: boolean,
): Promise<readonly CarouselSourceRecord[]> => {
  if (isMobileImagery) {
    const { CAROUSEL_SOURCES_MOBILE } = await import("./carouselData.mobile");
    return CAROUSEL_SOURCES_MOBILE;
  }

  const { CAROUSEL_SOURCES_DESKTOP } = await import("./carouselData.desktop");
  return CAROUSEL_SOURCES_DESKTOP;
};
