import type { Slide } from "../components/Carousel";

export type CarouselSourceRecord = Slide;

const COMPACT_LANDSCAPE_MEDIA =
  "(orientation: landscape) and (max-height: 520px)";

const ASSET_URLS = import.meta.glob<string>(
  "../assets/carousel/**/*.webp",
  {
    eager: true,
    import: "default",
    query: "?url",
  },
);

const asset = (
  aspect: "portrait" | "landscape",
  width: 480 | 720,
  index: number,
): string => {
  const key = `../assets/carousel/${aspect}/${width}/carousel${index}.webp`;
  const url = ASSET_URLS[key];
  if (!url) throw new Error(`Missing carousel asset: ${key}`);
  return url;
};

const buildSlide = (index: number): CarouselSourceRecord => {
  const portrait480 = asset("portrait", 480, index);
  const portrait720 = asset("portrait", 720, index);
  const landscape480 = asset("landscape", 480, index);
  const landscape720 = asset("landscape", 720, index);

  return {
    id: String(index),
    content: portrait480,
    image: {
      srcSet: `${portrait480} 480w, ${portrait720} 720w`,
      sources: [
        {
          media: COMPACT_LANDSCAPE_MEDIA,
          srcSet: `${landscape480} 480w, ${landscape720} 720w`,
          type: "image/webp",
        },
      ],
    },
  };
};

export const CAROUSEL_SOURCES: CarouselSourceRecord[] = Array.from(
  { length: 12 },
  (_, index) => buildSlide(index + 1),
);
