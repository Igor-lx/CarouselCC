export type {
  CarouselProps,
  CarouselHandle,
  CarouselStatusSnapshot,
  UserEnvironment,
  Slide,
  SlideImageVariants,
  SlideImageSource,
  ClassNameMap,
  ClassNameKey,
  SlideClassMap,
  SlideClassKey,
} from "./types";
export { CLASS_NAME_KEYS, SLIDE_CLASS_KEYS } from "./types";
// Host-side Zod schemas (the single source of truth the `Slide` family of types
// is inferred from) are intentionally NOT re-exported here. This barrel sits on
// the component's runtime import path, so a value re-export of the schemas would
// defeat tree-shaking and pull Zod into the app bundle. Hosts that want to
// validate external data opt in with an explicit deep import:
//   import { CarouselSlidesDataSchema } from "@/components/Carousel/client/public-api/schemas";
