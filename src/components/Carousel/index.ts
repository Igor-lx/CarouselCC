export { default } from "./Carousel";
export type {
  CarouselProps,
  CarouselHandle,
  CarouselStatusSnapshot,
  Slide,
  ClassNameMap,
  SlideClassMap,
  UserEnvironment,
} from "./contract";
export { SLIDE_CLASS_KEYS } from "./contract";
// Host-side opt-in Zod schemas. Imported separately from
// "@/components/Carousel/contract/schemas" so Zod is not pulled into
// the component's runtime bundle.
