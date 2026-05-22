import { memo, useMemo } from "react";

import { mergeStyleMaps } from "../../../../shared";
import { useCarouselModuleContext } from "../../context";
import type { CarouselSlotComponent } from "../../slots";
import { PaginationDot } from "./PaginationDot";
import styles from "./Pagination.module.scss";
import { usePaginationSync } from "./usePaginationSync";
import type { PaginationProps } from "./types";

const PaginationBase = memo(function Pagination({ className }: PaginationProps) {
  const {
    intent,
    layout,
    status,
    navigation,
  } = useCarouselModuleContext();

  const classNames = useMemo(
    () => (className ? mergeStyleMaps(styles, className) : styles),
    [className],
  );

  const shouldSyncInstantly =
    intent.moveReason !== "autoplay" || status.isJumping || layout.isReducedMotion;

  const displayedPageIndex = usePaginationSync({
    targetPageIndex: intent.targetPageIndex,
    shouldSyncInstantly,
    autoplayMotionDuration: intent.autoplayMotionDuration,
    autoplayPaginationFactor: intent.autoplayPaginationFactor,
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
          pageIndex={pageIndex}
          displayedPageIndex={displayedPageIndex}
          classNames={classNames}
          onPageSelect={navigation.handlePageSelect}
        />
      ))}
    </div>
  );
});

export const Pagination: CarouselSlotComponent<typeof PaginationBase, "pagination"> =
  Object.assign(PaginationBase, { slot: "pagination" as const });
