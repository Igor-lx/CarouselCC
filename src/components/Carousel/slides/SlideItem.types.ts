import type { CSSProperties } from "react";

import type { Slide, SlideClassMap } from "../contract/types";
import type { SlideAriaProps } from "../domain";
import type { ImageResourceStore } from "./imageResource";

export interface SlideItemProps extends SlideAriaProps {
  slideData: Slide | null | undefined;
  className: SlideClassMap;
  style: CSSProperties;
  isContentImg: boolean;
  imageResourceStore: ImageResourceStore | null;
  imageSizes: string;
  isDataSaverEnabled: boolean;
  errAltPlaceholder: string;
  isInteractive: boolean;
  isActive: boolean;
  isActual: boolean;
  onSlideClick?: (slide: Slide) => void;
}
