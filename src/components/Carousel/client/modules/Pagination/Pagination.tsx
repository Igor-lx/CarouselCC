import { memo, useMemo } from "react";

import { mergeStyleMaps } from "../../../../../shared";
import { useCarouselMotion, useCarouselStable } from "../../context";
import type { CarouselSlotComponent } from "../../slots";
import { PaginationDot } from "./PaginationDot";
import styles from "./Pagination.module.scss";
import { usePaginationFade } from "./usePaginationFade";
import type { PaginationProps } from "./types";

const PaginationBase = memo(function Pagination({ className }: PaginationProps) {
  const { intent } = useCarouselMotion();
  const { layout, navigation, motionPlan } = useCarouselStable();

  const classNames = useMemo(
    () => (className ? mergeStyleMaps(styles, className) : styles),
    [className],
  );

  // React marks the target dot active immediately on every command; for
  // engine-planned motions the fade binding masks the flip with a WAAPI
  // cross-fade over the plan's own curve, so the dot arrives WITH the
  // picture. Reduced motion (null plan source) stays static.
  const { bindDotRef } = usePaginationFade({
    motionPlan,
    targetPageIndex: intent.targetPageIndex,
    pageCount: layout.pageCount,
  });

  const pageIndexes = useMemo(
    () => Array.from({ length: layout.pageCount }, (_, index) => index),
    [layout.pageCount],
  );

  return (
    <div className={classNames.paginationWrapper} aria-hidden="true">
      {pageIndexes.map((pageIndex) => (
        <PaginationDot
          key={pageIndex}
          ref={bindDotRef(pageIndex)}
          pageIndex={pageIndex}
          isActive={pageIndex === intent.targetPageIndex}
          classNames={classNames}
          onPageSelect={navigation.handlePageSelect}
        />
      ))}
    </div>
  );
});

export const Pagination: CarouselSlotComponent<typeof PaginationBase, "pagination"> =
  Object.assign(PaginationBase, { slot: "pagination" as const });
