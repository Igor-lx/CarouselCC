import { useRef, type RefObject } from "react";
import { manageFocusShift, useIsomorphicLayoutEffect } from "../../../shared";

interface UseFocusRecoveryInput {
  containerRef: RefObject<HTMLElement | null>;
  isIdle: boolean;
  activePageIndex: number;
}

/**
 * On settle, if the currently-focused element is now hidden inside an
 * inert subtree (a slide that left the active band), move focus into the
 * new active band's first focusable target.
 */
export function useFocusRecovery({
  containerRef,
  isIdle,
  activePageIndex,
}: UseFocusRecoveryInput): void {
  const lastTriggerRef = useRef<{ isIdle: boolean; activePageIndex: number }>({
    isIdle: false,
    activePageIndex,
  });

  useIsomorphicLayoutEffect(() => {
    const previous = lastTriggerRef.current;
    lastTriggerRef.current = { isIdle, activePageIndex };

    if (!isIdle) return;
    if (previous.isIdle && previous.activePageIndex === activePageIndex) return;

    manageFocusShift(containerRef.current);
  }, [containerRef, activePageIndex, isIdle]);
}
