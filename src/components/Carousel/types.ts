import type { ReactElement, ReactNode, Ref } from "react";
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

/**
 * Low-frequency, read-only status handed to `onCarouselStatusChange`. Two
 * numbers — which page, out of how many — plus the idle flag and the two
 * boundary flags. Deliberately carries no per-frame data (position, velocity)
 * and no reducer internals: it is a status snapshot, not an animation feed.
 *
 * `isAtStart` / `isAtEnd` reflect the same boundary state the built-in
 * `<Controls>` slot uses to hide its zones; in cyclic (`isFinite={false}`)
 * mode both are always `false`. Hosts that drive the carousel through the
 * imperative `CarouselHandle` can wire them to `disabled` on their external
 * prev / next buttons so the buttons reflect the edge state without
 * duplicating the layout's `isFinite` rule.
 */
export interface CarouselStatusSnapshot {
  readonly isIdle: boolean;
  /** 0-based index of the page the carousel is on / heading to. */
  readonly currentPageIndex: number;
  readonly pageCount: number;
  /** Finite-mode only. Always `false` in cyclic mode. */
  readonly isAtStart: boolean;
  /** Finite-mode only. Always `false` in cyclic mode. */
  readonly isAtEnd: boolean;
}

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
  onCarouselStatusChange: OnCarouselStatusChangeSchema.optional(),
});

/**
 * Imperative handle for driving the carousel from outside its subtree —
 * external buttons elsewhere on the page, or programmatic control. Minimal by
 * design: only single-step navigation. Page jumps (`GO_TO`) stay internal,
 * reached through the pagination slot. Both methods route through the same
 * navigation pipeline as the built-in `<Controls>` — there is no second
 * control path — and are safe no-ops when the deck cannot slide.
 */
export interface CarouselHandle {
  /** Step one page towards the start. */
  prev(): void;
  /** Step one page towards the end. */
  next(): void;
}

export interface CarouselProps extends z.infer<typeof CarouselPropsSchema> {
  children?: ReactNode;
  /** Imperative handle — see {@link CarouselHandle}. */
  ref?: Ref<CarouselHandle>;
}

/**
 * Public Zod schema for the `slidesData` array alone — the most common thing
 * a host application needs to validate (e.g. an API response) before handing
 * it to the carousel. See {@link CarouselPropsSchema} for the rationale.
 */
export const CarouselSlidesDataSchema = CarouselPropsSchema.shape.slidesData;
