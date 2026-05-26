import type { ReactElement } from "react";
import { z } from "zod";

/**
 * Public Zod schemas for host-side runtime validation of external data
 * (API responses, CMS payloads, user config) before it reaches the carousel.
 *
 * The component itself stays zero-runtime on its prop types — invalid input
 * propagates and is surfaced by the `Diagnostic` slot as DEV-only warnings,
 * keeping the failure mode visible at the source. This module is the tool
 * a host uses to reject bad data up front; the carousel does not import it.
 *
 * Keeping the schemas out of the runtime path means Zod is not pulled into
 * the carousel's bundle: hosts opt in by importing
 * `@/components/Carousel/schemas` explicitly when they want validation.
 */

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

const ClassMapSchema = z
  .object({
    outerContainer: z.string(),
    innerContainer: z.string(),
    slideContainer: z.string(),
    slide: z.string(),
    slideInteractive: z.string(),
    slideError: z.string(),
    slideText: z.string(),
  })
  .partial();

const SlideSchema = z.object({
  id: z.union([z.string(), z.number()]),
  content: ContentSchema,
  alt: z.string().optional(),
});

const OnSlideClickSchema = z.function({
  input: [SlideSchema],
  output: z.void(),
});

const CarouselStatusSnapshotSchema = z.object({
  isIdle: z.boolean(),
  currentPageIndex: z.number(),
  pageCount: z.number(),
  isAtStart: z.boolean(),
  isAtEnd: z.boolean(),
});

const OnCarouselStatusChangeSchema = z.function({
  input: [CarouselStatusSnapshotSchema],
  output: z.void(),
});

const UserEnvironmentSchema = z
  .object({
    reducedMotion: z.boolean(),
    touch: z.boolean(),
    dataSaver: z.boolean(),
  })
  .partial();

/**
 * Schema for the full `CarouselProps` object. Excludes `children` and `ref`,
 * which are React-managed (not host data) and not meaningful to validate.
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
  onCarouselStatusChange: OnCarouselStatusChangeSchema.optional(),
});

/**
 * Schema for the `slidesData` array alone — the most common thing a host
 * application needs to validate (e.g. an API response) before handing it to
 * the carousel.
 */
export const CarouselSlidesDataSchema = CarouselPropsSchema.shape.slidesData;
