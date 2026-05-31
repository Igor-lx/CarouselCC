import clsx from "clsx";
import { memo, useCallback } from "react";

import type { PaginationClassMap } from "./types";

interface PaginationDotProps {
  pageIndex: number;
  displayedPageIndex: number;
  classNames: PaginationClassMap;
  onPageSelect: (pageIndex: number) => void;
}

export const PaginationDot = memo(function PaginationDot({
  pageIndex,
  displayedPageIndex,
  classNames,
  onPageSelect,
}: PaginationDotProps) {
  const handleClick = useCallback(
    () => onPageSelect(pageIndex),
    [onPageSelect, pageIndex],
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => event.preventDefault(),
    [],
  );

  const isActive = pageIndex === displayedPageIndex;

  return (
    <button
      type="button"
      className={clsx(classNames.dot, isActive && classNames.dotActive)}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      disabled={isActive}
      tabIndex={-1}
    />
  );
});
