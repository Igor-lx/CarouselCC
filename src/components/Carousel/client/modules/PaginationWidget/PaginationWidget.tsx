import { memo, useMemo } from "react";

import { mergeStyleMaps } from "../../../../../shared";
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
  const { layout, visualPosition, motionPlan } = useCarouselStable();

  const isMotionBound = visualPosition !== null && !layout.isReducedMotion;

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

  // The strip is a symmetric window of page-dot IDENTITIES around the current
  // page — one DOM node per page (not per recycling slot), so each dot's
  // projected trajectory is continuous and can be composited. The window
  // re-centres only when the target page changes (a settled step), never
  // per frame; the binding drives positions inside it.
  //
  // The centre is anchored in the *unbounded* page-offset domain
  // (`intent.targetPageOffset`), NOT the normalised `targetPageIndex`: the dot
  // projection is driven by the visual stream's `pageOffset`, which in cyclic
  // mode grows past the deck edges. Anchoring on the wrapped page index would
  // drift the window away from the live dots after a few steps and fade them all
  // out.
  const side = widgetProjectionSide(geometry.visibleCount);
  const centerPage = Math.round(intent.targetPageOffset);
  const dotIds = useMemo(
    () => widgetDotWindow(centerPage, side),
    [centerPage, side],
  );

  const { bindDotRef } = usePaginationWidgetBinding({
    visualPosition: isMotionBound ? visualPosition : null,
    motionPlan: isMotionBound ? motionPlan : null,
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
