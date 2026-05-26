export type {
  CarouselProps,
  CarouselHandle,
  CarouselStatusSnapshot,
  UserEnvironment,
  Slide,
  ClassNameMap,
  ClassNameKey,
  SlideClassMap,
  SlideClassKey,
} from "./types";
export { CLASS_NAME_KEYS, SLIDE_CLASS_KEYS } from "./classKeys";
// Host-side opt-in Zod schemas. Re-exported here so the public contract
// has one entry point; hosts that want validation can also import
// `@/components/Carousel/contract/schemas` directly.
export { CarouselPropsSchema, CarouselSlidesDataSchema } from "./schemas";
