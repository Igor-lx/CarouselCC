import type { CSSProperties } from "react";
import type { Slide, SlideClassMap } from "../contract/types";
import type { SlideAriaProps } from "../domain";
import type { ImageResourceStore } from "./imageResource";

export interface SlideItemProps extends SlideAriaProps {
  slideData: Slide | null | undefined;
  className: SlideClassMap;
  style: CSSProperties;
  isContentImg: boolean;
  errAltPlaceholder: string;
  isInteractive: boolean;
  isActive: boolean;
  isActual: boolean;
  /** The carousel's image-resource store, or `null` when image content is off. */
  imageResourceStore: ImageResourceStore | null;
  /**
   * Host reduced-data signal. When on, off-band images load lazily and at low
   * fetch priority so the deck does not eagerly pull bandwidth it may not need.
   */
  isDataSaverEnabled: boolean;
  onSlideClick?: (slide: Slide) => void;
}
