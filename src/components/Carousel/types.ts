import type { ReactElement, ReactNode, Ref } from "react";

import type { CLASS_NAME_KEYS, SLIDE_CLASS_KEYS } from "./classKeys";

export { SLIDE_CLASS_KEYS } from "./classKeys";

export type ClassNameKey = (typeof CLASS_NAME_KEYS)[number];
export type SlideClassKey = (typeof SLIDE_CLASS_KEYS)[number];

export type ClassNameMap = Partial<Record<ClassNameKey, string>>;
export type SlideClassMap = Pick<ClassNameMap, SlideClassKey>;

export interface Slide {
  id: string | number;
  content: string | number | ReactElement;
  alt?: string;
}

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
  isPagePaddingOn?: boolean;
  durationAutoplay?: number;
  intervalAutoplay?: number;
  durationStep?: number;
  jumpSpeedMultiplier?: number;
  isContentImg?: boolean;
  errAltPlaceholder?: string;
  isAuto?: boolean;
  isPaginationOn?: boolean;
  isInteractive?: boolean;
  isFinite?: boolean;
  isControlsOn?: boolean;
  className?: ClassNameMap;
  userEnvironment?: UserEnvironment;
  onSlideClick?: (slide: Slide) => void;
  onCarouselStatusChange?: (snapshot: CarouselStatusSnapshot) => void;
  children?: ReactNode;
  /** Imperative handle — see {@link CarouselHandle}. */
  ref?: Ref<CarouselHandle>;
}
