import type { Slide } from "../contract/types";

export interface CarouselLayout {
  length: number;
  visibleSlidesCount: number;
  virtualLength: number;
  pageCount: number;
  canSlide: boolean;
  isFinite: boolean;
  dataKey: string;
}

export interface CarouselSlideRecord {
  slideData: Slide;
  layoutIndex: number;
  slideKey: string;
}

export interface SlideAriaProps {
  role?: "group";
  "aria-roledescription"?: "slide";
  "aria-label"?: string;
  "aria-current"?: "step" | boolean;
}

export interface VirtualSlide {
  slideKey: string;
  slideData: Slide;
  isActive: boolean;
  isActual: boolean;
  ariaProps: SlideAriaProps;
}

export interface RenderWindow {
  start: number;
  end: number;
}

export interface PageBoundaryState {
  isAtStart: boolean;
  isAtEnd: boolean;
}
