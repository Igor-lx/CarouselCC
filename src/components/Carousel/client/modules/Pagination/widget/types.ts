// See docs/architecture/modules.md
import type { CSSProperties } from "react";

export interface PaginationWidgetSpatialConfig {
  size: number;
  gap: number;
  scaleFactor: number;
}

export interface PaginationWidgetGeometry {
  strip: number[];
  scales: number[];
  visibleCount: number;
  centerIndex: number;
  unit: number;
}

export interface PaginationWidgetDotState {
  id: number;
  x: number;
  scale: number;
  opacity: number;
  activeStrength: number;
  isActive: boolean;
}

export interface PaginationWidgetContainerCSSVars extends CSSProperties {
  "--visible-dots-count": string;
  "--dot-size": string;
  "--dots-gap": string;
}

export type PaginationWidgetClassMap = {
  [key: string]: string | undefined;
  activeDot_PW?: string;
  container_PW?: string;
  dot_PW?: string;
  dotActive_PW?: string;
};

export interface PaginationWidgetProps {
  className?: PaginationWidgetClassMap;
  dotSize?: number;
  dotGap?: number;
  visibleDots?: number;
  scaleFactor?: number;
}
