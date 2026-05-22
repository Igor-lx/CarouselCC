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

/**
 * Injected user-environment signals. The carousel does not detect these
 * itself — the host reads them once (see `useUserEnvironment` in `shared`)
 * and passes them in. Every field is optional; an unset field resolves to
 * `false` and is surfaced by the `Diagnostic` slot.
 */
const UserEnvironmentSchema = z
  .object({
    reducedMotion: z.boolean(),
    touch: z.boolean(),
    dataSaver: z.boolean(),
  })
  .partial();

/**
 * Public Zod schema for `CarouselProps`, exposed for the **host application**
 * to validate inputs from external sources (API responses, CMS, user config)
 * before passing them into the component.
 *
 * The carousel itself does NOT runtime-validate its own props — invalid input
 * propagates and is surfaced by the `Diagnostic` slot as DEV-only warnings,
 * keeping the failure mode visible at the source rather than silently
 * repaired. This schema is the tool a host app uses to reject bad data up
 * front; it is intentionally unused inside the component.
 */
export const CarouselPropsSchema = z.object({
  slidesData: z.array(SlideSchema),
  visibleSlidesNr: z.number().optional(),
  isPagePaddingOn: z.boolean().optional(),
  durationAutoplay: z.number().optional(),
  intervalAutoplay: z.number().optional(),
  durationStep: z.number().optional(),
  jumpSpeedMultiplier: z.number().optional(),
  isContentImg: z.boolean().optional(),
  errAltPlaceholder: z.string().optional(),
  isAuto: z.boolean().optional(),
  isPaginationOn: z.boolean().optional(),
  isInteractive: z.boolean().optional(),
  isFinite: z.boolean().optional(),
  isControlsOn: z.boolean().optional(),
  className: ClassMapSchema.optional(),
  userEnvironment: UserEnvironmentSchema.optional(),
  onSlideClick: OnSlideClickSchema.optional(),
  onMotionIdleStatusChange: OnMotionIdleStatusChangeSchema.optional(),
});

export interface CarouselProps extends z.infer<typeof CarouselPropsSchema> {
  children?: ReactNode;
}

/**
 * Public Zod schema for the `slidesData` array alone — the most common thing
 * a host application needs to validate (e.g. an API response) before handing
 * it to the carousel. See {@link CarouselPropsSchema} for the rationale.
 */
export const CarouselSlidesDataSchema = CarouselPropsSchema.shape.slidesData;
