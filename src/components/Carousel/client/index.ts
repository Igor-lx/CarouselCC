export { default } from "./Carousel";
export type {
  CarouselProps,
  CarouselHandle,
  CarouselStatusSnapshot,
  Slide,
  SlideImageVariants,
  SlideImageSource,
  ClassNameMap,
  SlideClassMap,
  UserEnvironment,
} from "./public-api";
export { SLIDE_CLASS_KEYS } from "./public-api";
// Responsive image content is produced by the self-contained `data-gen/` kit
// (Node-only; copy it to where the assets live and run it). It is deliberately
// NOT re-exported here — the browser entry stays free of `node:fs`.
// Host-side opt-in Zod schemas. Imported separately from
// "@/components/Carousel/contract/schemas" so Zod is not pulled into
// the component's runtime bundle.
