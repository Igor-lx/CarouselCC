import clsx from "clsx";
import { memo, useMemo, type CSSProperties } from "react";

import { mergeStyleMaps } from "../../../../../../shared";
import { useCarouselMotion, useCarouselStable } from "../../../context";
import type { CarouselSlotComponent } from "../../../slots";
import { useWidgetDiagnostic } from "../../Diagnostic/useWidgetDiagnostic";
import { buildPaginationWidgetGeometry } from "./math/spatialField";
import { projectDot } from "./math/projection";
import { usePaginationWidgetBinding } from "./usePaginationWidgetBinding";
import { PaginationWidgetDot } from "./PaginationWidgetDot";
import { PAGINATION_WIDGET_DEFAULTS } from "./defaults";

import styles from "./PaginationWidget.module.scss";

/**
 * The widget's JS→CSS custom-property contract — one dot's published
 * variables, DECLARED rather than cast inline (`CSSProperties` cannot express
 * custom properties). Same rule as the root's presentation module: JS hands
 * the stylesheet DATA, the rules stay in the stylesheet.
 */
interface PaginationDotCssVars extends CSSProperties {
  /** How strongly this dot reads as the active one — drives its colour and
   * scale accents in CSS. */
  "--dot-active-strength": number;
}

interface ProjectedDotStyleInput {
  opacity: number;
  x: number;
  scale: number;
  activeStrength: number;
}

const buildDotStyle = (dot: ProjectedDotStyleInput): PaginationDotCssVars => ({
  opacity: dot.opacity,
  transform: `translate3d(${dot.x}px, 0, 0) scale(${dot.scale})`,
  "--dot-active-strength": dot.activeStrength,
});
import type {
  PaginationWidgetContainerCSSVars,
  PaginationWidgetProps,
} from "./types";

const PaginationWidgetBase = memo(function PaginationWidget({
  visibleDots = PAGINATION_WIDGET_DEFAULTS.visibleDots,
  dotSize = PAGINATION_WIDGET_DEFAULTS.dotSize,
  dotGap = PAGINATION_WIDGET_DEFAULTS.dotGap,
  scaleFactor = PAGINATION_WIDGET_DEFAULTS.scaleFactor,
  className,
}: PaginationWidgetProps) {
  const { intent } = useCarouselMotion();
  const { layout, visualPosition, motionPlan } = useCarouselStable();

  // When reduced motion is on, the binding has nothing to subscribe to and we
  // render a static snapshot. Otherwise the binding runs the engine's plans:
  // WAAPI steps for planned motion, per-frame follow while a finger drags.
  const isMotionBound =
    visualPosition !== null && motionPlan !== null && !layout.isReducedMotion;

  const spatial = useMemo(
    () => ({ size: dotSize, gap: dotGap, scaleFactor }),
    [dotGap, dotSize, scaleFactor],
  );

  const geometry = useMemo(
    () => buildPaginationWidgetGeometry(visibleDots, spatial),
    [spatial, visibleDots],
  );

  const classNames = useMemo(
    () => mergeStyleMaps(styles, className),
    [className],
  );

  const { bindDotRef, bindActiveDotRef, slotCount, activeDotCount } =
    usePaginationWidgetBinding({
      visualPosition: isMotionBound ? visualPosition : null,
      motionPlan: isMotionBound ? motionPlan : null,
      geometry,
      activeClassName: classNames.dotActive_PW,
    });

  const boundSlotIndexes = useMemo(
    () => Array.from({ length: slotCount }, (_, index) => index),
    [slotCount],
  );

  const activeDotIndexes = useMemo(
    () => Array.from({ length: activeDotCount }, (_, index) => index),
    [activeDotCount],
  );

  useWidgetDiagnostic({ visibleDots, dotSize, dotGap, scaleFactor });

  const containerStyle = useMemo<PaginationWidgetContainerCSSVars>(
    () => ({
      "--visible-dots-count": String(geometry.visibleCount),
      "--dot-size": `${spatial.size}px`,
      "--dots-gap": `${spatial.gap}px`,
    }),
    [geometry.visibleCount, spatial.gap, spatial.size],
  );

  const staticDots = useMemo(() => {
    if (isMotionBound) return null;
    const offset = intent.targetPageIndex;
    return Array.from({ length: slotCount }, (_, index) => {
      const id = Math.round(offset) - Math.floor(slotCount / 2) + index;
      return projectDot(id, offset, geometry);
    });
  }, [geometry, intent.targetPageIndex, isMotionBound, slotCount]);

  return (
    <div
      className={classNames.container_PW}
      data-motion-bound={isMotionBound ? true : undefined}
      style={containerStyle}
    >
      {isMotionBound
        ? boundSlotIndexes.map((index) => (
            <PaginationWidgetDot
              key={`bound:${index}`}
              ref={bindDotRef(index)}
              className={classNames.dot_PW}
            />
          ))
        : staticDots?.map((dot) => (
            <div
              key={dot.id}
              className={clsx(classNames.dot_PW, dot.isActive && classNames.dotActive_PW)}
              style={buildDotStyle(dot)}
            />
          ))}
      {isMotionBound
        ? activeDotIndexes.map((index) => (
            <div
              key={`active:${index}`}
              ref={bindActiveDotRef(index)}
              className={classNames.activeDot_PW}
            />
          ))
        : null}
    </div>
  );
});

export const PaginationWidget: CarouselSlotComponent<
  typeof PaginationWidgetBase,
  "pagination"
> = Object.assign(PaginationWidgetBase, { slot: "pagination" as const });
