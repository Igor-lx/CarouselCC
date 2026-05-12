import clsx from "clsx";
import { memo, useMemo } from "react";

import { mergeStyleMaps } from "../../../../shared";
import { useCarouselModuleContext } from "../../context";
import type { CarouselSlotComponent } from "../../slots";
import { normalizePaginationWidgetConfig } from "./config";
import { buildPaginationWidgetGeometry } from "./math/spatialField";
import { projectDot } from "./math/projection";
import {
  usePaginationWidgetBinding,
  usePaginationWidgetLayoutNotice,
} from "./usePaginationWidgetBinding";
import { PaginationWidgetDot } from "./PaginationWidgetDot";
import { PAGINATION_WIDGET_DEFAULTS } from "./defaults";
import styles from "./PaginationWidget.module.scss";
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
  const { intent, layout, visualPosition } = useCarouselModuleContext();

  // When reduced motion is on, the binding has nothing to subscribe to and
  // we render a static snapshot. Otherwise we render the bound mode where
  // dots are mutated frame-by-frame by the binding.
  const isMotionBound = visualPosition !== null && !layout.isReducedMotion;

  const { visibleDots: normalizedVisibleDots, spatial } = useMemo(
    () =>
      normalizePaginationWidgetConfig({ visibleDots, dotSize, dotGap, scaleFactor }),
    [dotGap, dotSize, scaleFactor, visibleDots],
  );

  const geometry = useMemo(
    () => buildPaginationWidgetGeometry(normalizedVisibleDots, spatial),
    [normalizedVisibleDots, spatial],
  );

  const classNames = useMemo(
    () => mergeStyleMaps(styles, className),
    [className],
  );

  const { bindDotRef, bindActiveDotRef, slotCount, activeDotCount } =
    usePaginationWidgetBinding({
      visualPosition: isMotionBound ? visualPosition : null,
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

  usePaginationWidgetLayoutNotice({
    requestedVisibleDots: visibleDots,
    normalizedVisibleDots: geometry.visibleCount,
  });

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
    const offset = intent.activePageIndex;
    return Array.from({ length: slotCount }, (_, index) => {
      const id = Math.round(offset) - Math.floor(slotCount / 2) + index;
      return projectDot(id, offset, geometry);
    });
  }, [geometry, intent.activePageIndex, isMotionBound, slotCount]);

  if (layout.pageCount <= 1) return null;

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
              style={{
                opacity: dot.opacity,
                transform: `translate3d(${dot.x}px, 0, 0) scale(${dot.scale})`,
                ...({
                  "--dot-active-strength": dot.activeStrength,
                } as React.CSSProperties),
              }}
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
