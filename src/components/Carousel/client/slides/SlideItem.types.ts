import type { CSSProperties } from "react";
import type { Slide, SlideClassMap } from "../public-api/types";
import type { SlideAriaProps } from "../domain";
import type { ImageResourceStore } from "./imageResource";

export interface SlideItemProps extends SlideAriaProps {
  slideData: Slide | null | undefined;
  className: SlideClassMap;
  style: CSSProperties;
  isContentImg: boolean;
  /** Presence switch of the <ResponsiveImages /> module: gates the whole
   * responsive surface (sources/srcSet/sizes, rotation veil) and flips the
   * rendered URL rule (see resolveRenderedImageSrc). */
  isResponsiveImagesOn: boolean;
  errAltPlaceholder: string;
  isInteractive: boolean;
  isActive: boolean;
  isActual: boolean;
  /** The carousel's image-resource store, or `null` when image content is off. */
  imageResourceStore: ImageResourceStore | null;
  /**
   * Carousel-derived default `sizes` (from `visibleSlidesCount`) for responsive
   * `srcSet`/`<source>` selection. A slide's own `image.sizes` overrides it.
   */
  imageSizes: string;
  /**
   * Host reduced-data signal. When on, off-band images load lazily and at low
   * fetch priority so the deck does not eagerly pull bandwidth it may not need.
   */
  isDataSaverEnabled: boolean;
  onSlideClick?: (slide: Slide) => void;
}
