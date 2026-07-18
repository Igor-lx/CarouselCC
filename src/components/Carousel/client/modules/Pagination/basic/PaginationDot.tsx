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
  /** Element ref for the engine-driven cross-fade binding. Typed as the
   * callback shape `usePaginationFade` hands out, so it fits either tag. */
  ref?: (node: HTMLElement | null) => void;
}

/**
 * One pagination dot: a `<button>` when the dots accept clicks, a plain
 * `<div>` when they do not — no handler, and the stylesheet withholds the
 * pointer affordance with the `dotInteractive` class.
 *
 * Unlike a slide, whose clickability is conditional on runtime state (a click
 * handler being supplied, the image having loaded), a dot's is pure
 * configuration: it depends on nothing but the flag. `isActive` only marks the
 * current page — it drives the active styling and `disabled`, never the tag.
 *
 * Dots are `aria-hidden` at the wrapper and `tabIndex={-1}`, so this is a
 * pointer affordance only; assistive tech and keyboard users are unaffected
 * either way and navigate through `<Controls>` or the host's own buttons.
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
