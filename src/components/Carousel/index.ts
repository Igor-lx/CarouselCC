export { default } from "./Carousel";
export type {
  CarouselProps,
  CarouselHandle,
  CarouselStatusSnapshot,
  Slide,
  ClassNameMap,
  SlideClassMap,
  UserEnvironment,
} from "./types";
export { SLIDE_CLASS_KEYS } from "./classKeys";
// Host-side opt-in Zod schemas. Imported separately from
// "@/components/Carousel/schemas" so Zod is not pulled into the
// component's runtime bundle.
