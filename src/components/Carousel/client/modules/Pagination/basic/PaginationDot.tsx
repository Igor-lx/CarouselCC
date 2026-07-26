// See docs/architecture/modules.md
import clsx from "clsx";
import { memo, useCallback } from "react";

import type { PaginationClassMap } from "./types";

interface PaginationDotProps {
  pageIndex: number;
  isActive: boolean;
  /** Whether the dots accept clicks (`isPaginationInteractiveOn`). */
  isInteractiveOn: boolean;
  classNames: PaginationClassMap;
  onPageSelect: (pageIndex: number) => void;
  /** Element ref for the engine-driven cross-fade binding (fits either tag). */
  ref?: (node: HTMLElement | null) => void;
}

// A <button> when interactive, else a plain <div>; dots are aria-hidden pointer
// affordances only (page indication reaches AT via aria-current on the band).
export const PaginationDot = memo(function PaginationDot({
  pageIndex,
  isActive,
  isInteractiveOn,
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

  const className = clsx(
    classNames.dot,
    isActive && classNames.dotActive,
    isInteractiveOn && classNames.dotInteractive,
  );

  if (!isInteractiveOn) {
    return <div ref={ref} className={className} />;
  }

  return (
    <button
      ref={ref}
      type="button"
      className={className}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      disabled={isActive}
      tabIndex={-1}
    />
  );
});
