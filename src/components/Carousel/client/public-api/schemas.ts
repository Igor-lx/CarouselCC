// Zod schemas for the slide-data contract — the `Slide`* types are inferred
// from these. NOT re-exported from the barrel, to keep Zod out of the app
// bundle (host deep-imports to validate). See docs/architecture/public-api.md
import type { ReactElement } from "react";
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

export const SlideImageSourceSchema = z.object({
  media: z.string().trim().min(1),
  srcSet: z.string().trim().min(1),
  sizes: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1).optional(),
});

export const SlideImageVariantsSchema = z.object({
  srcSet: z.string().trim().min(1).optional(),
  sizes: z.string().trim().min(1).optional(),
  /** The publisher's designated single-set asset (rendered when responsive is off). */
  defaultSrc: z.string().trim().min(1).optional(),
  sources: z.array(SlideImageSourceSchema).readonly().optional(),
});

export const SlideSchema = z.object({
  id: z.union([z.string(), z.number()]),
  content: ContentSchema,
  alt: z.string().optional(),
  image: SlideImageVariantsSchema.optional(),
});

/** The `slidesData` array — the single public entry point for validation. */
export const CarouselSlidesDataSchema = z.array(SlideSchema);
