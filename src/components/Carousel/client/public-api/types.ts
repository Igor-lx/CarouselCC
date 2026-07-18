import type { ReactNode, Ref } from "react";
import type { z } from "zod";

import type {
  SlideImageSourceSchema,
  SlideImageVariantsSchema,
  SlideSchema,
} from "./schemas";

/**
 * Single source of truth for the class-name keys the carousel and its slides
 * accept through `className`. Plain `as const` arrays with zero dependencies
 * (no React, no Zod): the runtime hot path iterates them and the key types
 * below derive from the same definition. These two arrays are the only runtime
 * values this otherwise type-only module emits.
 */
export const SLIDE_CLASS_KEYS = [
  "slide",
  "slideInteractive",
  "slideError",
  "slideText",
] as const;

export const CLASS_NAME_KEYS = [
  "outerContainer",
  "innerContainer",
  "slideContainer",
  ...SLIDE_CLASS_KEYS,
] as const;

export type ClassNameKey = (typeof CLASS_NAME_KEYS)[number];
export type SlideClassKey = (typeof SLIDE_CLASS_KEYS)[number];

export type ClassNameMap = Partial<Record<ClassNameKey, string>>;
export type SlideClassMap = Pick<ClassNameMap, SlideClassKey>;

/**
 * One art-directed `<source>` for a slide's `<picture>` (render-only). Inferred
 * from {@link SlideImageSourceSchema} (single source of truth). Fields:
 * `media` — the media condition under which the browser may pick this source;
 * `srcSet` — candidate set, normally with width (`w`) descriptors;
 * `sizes?` — slot hint, defaults to the carousel's auto-derived value;
 * `type?` — e.g. `"image/webp"`, lets the browser skip an unsupported source.
 */
export type SlideImageSource = z.infer<typeof SlideImageSourceSchema>;

/**
 * Render-only responsive image variants for an image slide. The browser selects
 * the concrete asset (by `sizes` / DPR within `srcSet`, by `media` for
 * `sources`). This NEVER participates in slide identity: reconcile and `dataKey`
 * key only on `id` + `content`, so supplying or switching variants (e.g. an
 * orientation-specific crop) never resets the viewing position.
 *
 * Inferred from {@link SlideImageVariantsSchema}. Fields: `srcSet?` — resolution
 * candidates for the default `<img>` (width `w` descriptors); `sizes?` —
 * override the carousel's auto-derived `sizes` (rarely needed); `defaultSrc?`
 * — the publisher's designated single-set asset, rendered when responsive
 * selection is off (no `<ResponsiveImages />`); `sources?` — art-directed
 * `<source>` overrides (e.g. a landscape crop).
 */
export type SlideImageVariants = z.infer<typeof SlideImageVariantsSchema>;

/**
 * A single slide. Inferred from {@link SlideSchema} — the same schema a host
 * uses to validate external slide data, so the type and the runtime contract
 * cannot drift.
 *
 * `id` + `content` are the ONLY fields that feed `dataKey`/reconcile, so
 * `content` (logical identity + fallback `<img src>`) must stay stable across
 * responsive variants. `image` is render-only (see {@link SlideImageVariants});
 * `alt` is the accessible text (an empty string marks a decorative image).
 */
export type Slide = z.infer<typeof SlideSchema>;

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

/**
 * Injected user-environment signals. The carousel does not detect these
 * itself — the host reads them once (see `useUserEnvironment` in `shared`)
 * and passes them in. Every field is optional; an unset field resolves to
 * `false` and is surfaced by the `Diagnostic` slot.
 */
export interface UserEnvironment {
  reducedMotion?: boolean;
  touch?: boolean;
  dataSaver?: boolean;
}

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

export interface CarouselProps {
  slidesData: Slide[];
  visibleSlidesNr?: number;
  isFullPagesOn?: boolean;
  durationAutoplay?: number;
  intervalAutoplay?: number;
  durationStep?: number;
  jumpSpeedMultiplier?: number;
  isContentImg?: boolean;
  errAltPlaceholder?: string;
  isAuto?: boolean;
  isPaginationOn?: boolean;
  isInteractiveOn?: boolean;
  isFinite?: boolean;
  isControlsOn?: boolean;
  isSwipeOn?: boolean;
  className?: ClassNameMap;
  userEnvironment?: UserEnvironment;
  onSlideClick?: (slide: Slide) => void;
  onCarouselStatusChange?: (snapshot: CarouselStatusSnapshot) => void;
  children?: ReactNode;
  /** Imperative handle — see {@link CarouselHandle}. */
  ref?: Ref<CarouselHandle>;
}
