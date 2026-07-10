import clsx from "clsx";
import { memo, useCallback, type Ref } from "react";

import type { PaginationClassMap } from "./types";

interface PaginationDotProps {
  pageIndex: number;
  isActive: boolean;
  classNames: PaginationClassMap;
  onPageSelect: (pageIndex: number) => void;
  /** Element ref for the engine-driven cross-fade binding. */
  ref?: Ref<HTMLButtonElement>;
}

export const PaginationDot = memo(function PaginationDot({
  pageIndex,
  isActive,
  classNames,
  onPageSelect,
  ref,
}: PaginationDotProps) {
  const handleClick = useCallback(
    () => onPageSelect(pageIndex),
    [onPageSelect, pageIndex],
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => event.preventDefault(),
    [],
  );

  return (
    <button
      ref={ref}
      type="button"
      className={clsx(classNames.dot, isActive && classNames.dotActive)}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      disabled={isActive}
      tabIndex={-1}
    />
  );
});
