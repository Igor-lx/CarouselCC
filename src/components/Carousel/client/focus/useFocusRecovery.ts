// See docs/architecture/focus.md
import { useRef, type RefObject } from "react";
import {
  manageFocusShift,
  useIsomorphicLayoutEffect,
} from "../../../../shared";

interface UseFocusRecoveryInput {
  containerRef: RefObject<HTMLElement | null>;
  isIdle: boolean;
  targetPageIndex: number;
}

export function useFocusRecovery({
  containerRef,
  isIdle,
  targetPageIndex,
}: UseFocusRecoveryInput): void {
  const lastTriggerRef = useRef<{ isIdle: boolean; targetPageIndex: number }>({
    isIdle: false,
    targetPageIndex,
  });

  useIsomorphicLayoutEffect(() => {
    const previous = lastTriggerRef.current;
    lastTriggerRef.current = { isIdle, targetPageIndex };

    if (!isIdle) return;
    if (previous.isIdle && previous.targetPageIndex === targetPageIndex) return;

    manageFocusShift(containerRef.current);
  }, [containerRef, targetPageIndex, isIdle]);
}
