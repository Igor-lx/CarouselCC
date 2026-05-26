import type { ReactNode, Ref } from "react";
import type { z } from "zod";

import type { SLIDE_CLASS_KEYS } from "./classKeys";
import type {
  CarouselPropsSchema,
  CarouselSlidesDataSchema,
  CarouselStatusSnapshotSchema,
  ClassMapSchema,
  UserEnvironmentSchema,
} from "./schemas";

export type Slide = z.infer<typeof CarouselSlidesDataSchema>[number];
export type ClassNameMap = z.infer<typeof ClassMapSchema>;
export type SlideClassKey = (typeof SLIDE_CLASS_KEYS)[number];
export type SlideClassMap = Pick<ClassNameMap, SlideClassKey>;
export type CarouselStatusSnapshot = Readonly<
  z.infer<typeof CarouselStatusSnapshotSchema>
>;
export type CarouselUserEnvironment = z.infer<typeof UserEnvironmentSchema>;

/**
 * Imperative handle for driving the carousel from outside its subtree -
 * external buttons elsewhere on the page, or programmatic control. Minimal by
 * design: only single-step navigation. Page jumps (`GO_TO`) stay internal,
 * reached through the pagination slot. Both methods route through the same
 * navigation pipeline as the built-in `<Controls>` - there is no second
 * control path - and are safe no-ops when the deck cannot slide.
 */
export interface CarouselHandle {
  /** Step one page towards the start. */
  prev(): void;
  /** Step one page towards the end. */
  next(): void;
}

export interface CarouselProps extends z.infer<typeof CarouselPropsSchema> {
  children?: ReactNode;
  /** Imperative handle - see {@link CarouselHandle}. */
  ref?: Ref<CarouselHandle>;
}
