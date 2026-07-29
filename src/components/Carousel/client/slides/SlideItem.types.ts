// See docs/architecture/slides.md
import type { CSSProperties } from "react";
import type { Slide, SlideClassMap } from "../public-api/types";
import type { SlideAriaProps } from "../domain";
import type { ImageResourceStore } from "./imageResource";

export interface SlideItemProps extends SlideAriaProps {
  slideData: Slide | null | undefined;
  className: SlideClassMap;
  style: CSSProperties;
  isContentImg: boolean;
  /** Presence switch of <ResponsiveImages />; gates the whole responsive surface. */
  isResponsiveImagesOn: boolean;
  errAltPlaceholder: string;
  isInteractiveOn: boolean;
  isActive: boolean;
  isActual: boolean;
  /** Bandwidth gate: `false` withholds an off-band slide's sources (see useActiveBandGate). */
  isOffBandFetchOn: boolean;
  imageResourceStore: ImageResourceStore | null;
  /** Carousel-derived default `sizes`; a slide's own `image.sizes` overrides it. */
  imageSizes: string;
  /** Viewport signature from the root's single media read — drives the
   * orientation-swap veil without a per-slide media subscription. */
  viewportSignature: string;
  /** Host reduced-data signal — off-band images load lazily at low priority. */
  isDataSaverEnabled: boolean;
  onSlideClick?: (slide: Slide) => void;
}
