import type { ReactElement, ReactNode } from "react";
import { z } from "zod";

const ReactElementSchema = z.custom<ReactElement>((value) => {
  if (typeof value !== "object" || value === null) return false;
  const sigil = (value as { $$typeof?: unknown }).$$typeof;
  return (
    sigil === Symbol.for("react.element") ||
    sigil === Symbol.for("react.transitional.element")
  );
});

const ContentSchema = z.union([
  z.string().trim().min(1),
  z.number(),
  ReactElementSchema,
]);

const DeckClassMapSchema = z.object({
  outerContainer: z.string(),
  innerContainer: z.string(),
  slideContainer: z.string(),
});

const SlideClassMapSchema = z.object({
  slide: z.string(),
  slideInteractive: z.string(),
  slideError: z.string(),
  slideText: z.string(),
});

export const SLIDE_CLASS_KEYS = SlideClassMapSchema.keyof().options;

const ClassMapSchema = z
  .object({
    ...DeckClassMapSchema.shape,
    ...SlideClassMapSchema.shape,
  })
  .partial();

export type ClassNameMap = z.infer<typeof ClassMapSchema>;
export type SlideClassMap = Pick<ClassNameMap, (typeof SLIDE_CLASS_KEYS)[number]>;

const SlideSchema = z.object({
  id: z.union([z.string(), z.number()]),
  content: ContentSchema,
  alt: z.string().optional(),
});

export type Slide = z.infer<typeof SlideSchema>;

const OnSlideClickSchema = z.function({
  input: [SlideSchema],
  output: z.void(),
});

const OnMotionIdleStatusChangeSchema = z.function({
  input: [z.boolean()],
  output: z.void(),
});

export const CarouselPropsSchema = z.object({
  slidesData: z.array(SlideSchema),
  visibleSlidesNr: z.number().optional(),
  isPagePaddingOn: z.boolean().optional(),
  durationAutoplay: z.number().optional(),
  intervalAutoplay: z.number().optional(),
  durationStep: z.number().optional(),
  durationJump: z.number().optional(),
  isContentImg: z.boolean().optional(),
  errAltPlaceholder: z.string().optional(),
  isAuto: z.boolean().optional(),
  isPaginationOn: z.boolean().optional(),
  isInteractive: z.boolean().optional(),
  isFinite: z.boolean().optional(),
  isControlsOn: z.boolean().optional(),
  className: ClassMapSchema.optional(),
  isInstantMotion: z.boolean().optional(),
  isTouchDevice: z.boolean().optional(),
  onSlideClick: OnSlideClickSchema.optional(),
  onMotionIdleStatusChange: OnMotionIdleStatusChangeSchema.optional(),
});

export interface CarouselProps extends z.infer<typeof CarouselPropsSchema> {
  children?: ReactNode;
}

export const CarouselSlidesDataSchema = CarouselPropsSchema.shape.slidesData;
