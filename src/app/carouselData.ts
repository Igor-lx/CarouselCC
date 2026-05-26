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
