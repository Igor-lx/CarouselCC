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

export interface CarouselHandle {
  prev(): void;
  next(): void;
}

export interface CarouselProps extends z.infer<typeof CarouselPropsSchema> {
  children?: ReactNode;
  ref?: Ref<CarouselHandle>;
}
