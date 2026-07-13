import type { ReactElement } from "react";
import { z } from "zod";

/**
 * Zod schemas for the slide-data contract — the single source of truth for the
 * shape of the `carousel-slides.json` document the component consumes.
 *
 * Two jobs, one definition:
 *  - `Slide`, `SlideImageVariants` and `SlideImageSource` are inferred from these
 *    schemas (`z.infer`, type-only — see `types.ts`), so the validated shape and
 *    the compile-time type cannot drift.
 *  - A host validates external slide data (an API response, a CMS payload, the
 *    generated JSON) against `CarouselSlidesDataSchema` before passing it as
 *    `slidesData`. This is the ONLY thing Zod is used for here — there are no
 *    prop/callback schemas. The carousel never runtime-validates its own props:
 *    invalid input propagates and is surfaced by the `Diagnostic` slot as
 *    DEV-only warnings, keeping the failure mode visible at the source.
 *
 * Importing a TYPE from the contract is erased; importing a SCHEMA (a value)
 * pulls in Zod. So this module is deliberately NOT re-exported from the contract
 * barrel or the component entry — that keeps Zod out of the app bundle. Hosts
 * opt in with an explicit deep import:
 *   import { CarouselSlidesDataSchema } from "@/components/Carousel/client/public-api/schemas";
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

/**
 * Source of truth for the `SlideImageSource` type (inferred in `types.ts`).
 * Strings are trimmed and must be non-empty: an empty `media`/`srcSet` is never
 * a valid source and is rejected at the host boundary rather than emitted as a
 * dead `<source>`.
 */
export const SlideImageSourceSchema = z.object({
  media: z.string().trim().min(1),
  srcSet: z.string().trim().min(1),
  sizes: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1).optional(),
  // Intrinsic aspect (width / height) of this set's crop. OPTIONAL metadata:
  // `w` descriptors carry width only, so pixel AREA is unknowable without
  // it. When every set declares its aspect, single-set mode ("largest
  // image") compares candidates by area instead of width — no orientation
  // heuristics, just declared geometry.
  aspect: z.number().positive().optional(),
});

/**
 * Source of truth for the `SlideImageVariants` type. `sources` is `.readonly()`
 * so the inferred type is `readonly SlideImageSource[]` — the carousel only ever
 * reads it.
 */
export const SlideImageVariantsSchema = z.object({
  srcSet: z.string().trim().min(1).optional(),
  sizes: z.string().trim().min(1).optional(),
  // Intrinsic aspect (width / height) of the DEFAULT set's crop — see
  // `SlideImageSourceSchema.aspect`.
  aspect: z.number().positive().optional(),
  sources: z.array(SlideImageSourceSchema).readonly().optional(),
});

/** Source of truth for the `Slide` type (inferred in `types.ts`). */
export const SlideSchema = z.object({
  id: z.union([z.string(), z.number()]),
  content: ContentSchema,
  alt: z.string().optional(),
  image: SlideImageVariantsSchema.optional(),
});

/**
 * The `slidesData` array — the shape of the `carousel-slides.json` document a
 * host validates before handing the data to the carousel. The single public
 * entry point for validation.
 */
export const CarouselSlidesDataSchema = z.array(SlideSchema);
