import { buildResponsiveSlides, type Slide } from "../components/Carousel";

/**
 * Demo host data: import the image assets, group them into one named set per
 * resolution/orientation, and hand those sets to the carousel's
 * `buildResponsiveSlides`. All the slide shaping — canonical fallback,
 * `w`-descriptor srcSets, `<source>` crops, `sizes` — lives in the builder, so
 * this file carries no assembly logic: just asset sets in, `Slide[]` out.
 *
 * One stable set for every viewport (no per-device array swap): the browser
 * selects the per-resolution / per-orientation asset natively, and slide
 * identity (`content`) never changes, so rotation preserves the position.
 *
 * `import.meta.glob({ eager, query: "?url" })` pulls only short URL strings into
 * the bundle; the `.webp` bytes stay separate assets fetched only when selected.
 */

/** `"…/carousel7.webp"` -> `7`, ignoring any digits in the folder path. */
const slideNumber = (path: string): number =>
  Number.parseInt(path.slice(path.lastIndexOf("/") + 1).replace(/\D/g, ""), 10);

/** A variant folder -> its URLs ordered by slide number (so sets stay aligned). */
const orderedUrls = (glob: Record<string, string>): string[] =>
  Object.entries(glob)
    .sort(([a], [b]) => slideNumber(a) - slideNumber(b))
    .map(([, url]) => url);

// `import.meta.glob` options must be an inline object literal — it is a
// compile-time transform, so the options cannot be hoisted to a shared const.
const portraitW480 = orderedUrls(
  import.meta.glob<string>("../assets/carousel/mobile/*.webp", {
    eager: true,
    query: "?url",
    import: "default",
  }),
);
const portraitW720 = orderedUrls(
  import.meta.glob<string>("../assets/carousel/desktop/*.webp", {
    eager: true,
    query: "?url",
    import: "default",
  }),
);
const landscapeW480 = orderedUrls(
  import.meta.glob<string>("../assets/carousel/landscape/480/*.webp", {
    eager: true,
    query: "?url",
    import: "default",
  }),
);
const landscapeW720 = orderedUrls(
  import.meta.glob<string>("../assets/carousel/landscape/720/*.webp", {
    eager: true,
    query: "?url",
    import: "default",
  }),
);

// Product decision: the portrait asset is the default; the landscape crop only
// applies in the wide-and-short slot (matches the compact-landscape breakpoint).
const LANDSCAPE_CROP_MEDIA = "(orientation: landscape) and (max-height: 520px)";

export const CAROUSEL_SLIDES: readonly Slide[] = buildResponsiveSlides({
  sets: [
    { width: 480, urls: portraitW480 },
    { width: 720, urls: portraitW720 },
  ],
  sources: [
    {
      media: LANDSCAPE_CROP_MEDIA,
      type: "image/webp",
      sets: [
        { width: 480, urls: landscapeW480 },
        { width: 720, urls: landscapeW720 },
      ],
    },
  ],
});
