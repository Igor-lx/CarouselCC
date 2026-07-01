import { memo, useMemo, useRef } from "react";

import { mergeStyleMaps } from "../../../../../shared";
import { shortestCyclicDistance } from "../../domain";
import { useCarouselMotion, useCarouselStable } from "../../context";
import type { CarouselSlotComponent } from "../../slots";
import { useWidgetDiagnostic } from "../Diagnostic/useWidgetDiagnostic";
import { buildPaginationWidgetGeometry, widgetProjectionSide } from "./math/spatialField";
import { usePaginationWidgetBinding, widgetDotWindow } from "./usePaginationWidgetBinding";
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
  const { intent } = useCarouselMotion();
  const { layout } = useCarouselStable();

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

  // --- the widget's own monotonic offset ------------------------------------
  // The widget is a decoupled step indicator: it tracks *changes* to the
  // carousel's normalised target page and advances its own offset by exactly one
  // dot in the shortest-cyclic direction — never mirroring how far the deck
  // actually travelled. This offset lives in the widget's private, unbounded
  // coordinate, so (unlike the deck's wrapping page index) the dot window never
  // drifts off the live dots.
  const offsetRef = useRef(0);
  const prevPageRef = useRef(intent.targetPageIndex);
  const targetPage = intent.targetPageIndex;
  const pageCount = layout.pageCount;
  if (targetPage !== prevPageRef.current) {
    const dir = Math.sign(
      pageCount > 0
        ? shortestCyclicDistance(prevPageRef.current, targetPage, pageCount)
        : targetPage - prevPageRef.current,
    );
    if (dir !== 0) offsetRef.current += dir;
    prevPageRef.current = targetPage;
  }
  const centerOffset = offsetRef.current;

  const side = widgetProjectionSide(geometry.visibleCount);
  const dotIds = useMemo(
    () => widgetDotWindow(Math.round(centerOffset), side),
    [centerOffset, side],
  );

  const { bindDotRef } = usePaginationWidgetBinding({
    targetOffset: centerOffset,
    isInstant: layout.isReducedMotion,
    geometry,
    dotIds,
  });

  useWidgetDiagnostic({ visibleDots, dotSize, dotGap, scaleFactor });

  const containerStyle = useMemo<PaginationWidgetContainerCSSVars>(
    () => ({
      "--visible-dots-count": String(geometry.visibleCount),
      "--dot-size": `${spatial.size}px`,
      "--dots-gap": `${spatial.gap}px`,
    }),
    [geometry.visibleCount, spatial.gap, spatial.size],
  );

  return (
    <div className={classNames.container_PW} style={containerStyle}>
      {dotIds.map((id) => (
        <PaginationWidgetDot
          key={id}
          ref={bindDotRef(id)}
          className={classNames.dot_PW}
        />
      ))}
    </div>
  );
});

export const PaginationWidget: CarouselSlotComponent<
  typeof PaginationWidgetBase,
  "pagination"
> = Object.assign(PaginationWidgetBase, { slot: "pagination" as const });
