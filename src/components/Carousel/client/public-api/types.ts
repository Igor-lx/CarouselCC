// See docs/architecture/public-api.md
import type { ReactNode, Ref } from "react";
import type { z } from "zod";

import type {
  SlideImageSourceSchema,
  SlideImageVariantsSchema,
  SlideSchema,
} from "./schemas";

/** SSOT for the class-name keys accepted through `className`. */
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

/** One art-directed `<source>` for a slide's `<picture>` (render-only). */
export type SlideImageSource = z.infer<typeof SlideImageSourceSchema>;

/** Render-only responsive image variants; never part of slide identity. */
export type SlideImageVariants = z.infer<typeof SlideImageVariantsSchema>;

/** A single slide; identity is `id` + `content` only (see public-api.md). */
export type Slide = z.infer<typeof SlideSchema>;

/** Low-frequency read-only status for `onCarouselStatusChange` (no per-frame data). */
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

/** Injected user-environment signals; the carousel never detects them itself. */
export interface UserEnvironment {
  reducedMotion?: boolean;
  touch?: boolean;
  dataSaver?: boolean;
}

/** Imperative handle for external control — single-step navigation only. */
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
  isContentImg?: boolean;
  errAltPlaceholder?: string;
  isAutoplayOn?: boolean;
  isPaginationOn?: boolean;
  isSlideInteractiveOn?: boolean;
  isPaginationInteractiveOn?: boolean;
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
