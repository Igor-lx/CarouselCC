import clsx from "clsx";
import { memo, useCallback } from "react";

import type { PaginationClassMap } from "./types";

interface PaginationDotProps {
  pageIndex: number;
  isActive: boolean;
  /** Mirrors the slide's rule: interactive dots render as `<button>`,
   * non-interactive ones as an inert `<div>` (see the component note). */
  isInteractiveOn: boolean;
  classNames: PaginationClassMap;
  onPageSelect: (pageIndex: number) => void;
  /** Element ref for the engine-driven cross-fade binding. Typed as the
   * callback shape `usePaginationFade` hands out, so it fits either tag. */
  ref?: (node: HTMLElement | null) => void;
}

/**
 * One pagination dot.
 *
 * Interactivity follows the same rule as a slide (see `SlideItem`): when it is
 * off the dot is not a disabled button but a plain `<div>` — no click handler,
 * no button semantics, and the stylesheet withholds `cursor`/`hover`/
 * `pointer-events` with it (the `dotInteractive` class). The dots are already
 * `aria-hidden` and `tabIndex={-1}` at the wrapper, so nothing is lost for
 * assistive tech or keyboard users — this is a pointer affordance only.
 *
 * The TAG depends solely on `isInteractiveOn`, never on `isActive`: the active
 * dot stays a `<button disabled>` rather than swapping to a `<div>`, because a
 * tag change remounts the element and would tear the cross-fade's ref binding
 * out from under a running WAAPI animation on every page change.
 */
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
