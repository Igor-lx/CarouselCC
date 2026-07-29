// See ./README.md
import { useRef, useState, type RefObject } from "react";
import { useIsomorphicLayoutEffect } from "../hooks/useIsomorphicLayoutEffect";

interface UseViewportVisibilityProps {
  elementRef: RefObject<Element | null>;
  threshold?: number;
}

export function useViewportVisibility({
  elementRef,
  threshold = 0.2,
}: UseViewportVisibilityProps): boolean {
  const [visible, setVisible] = useState(false);
  const intersectingRef = useRef(false);

  useIsomorphicLayoutEffect(() => {
    const target = elementRef.current;
    if (!target) return;

    const update = () => {
      const tabActive = document.visibilityState === "visible";
      const next = tabActive && intersectingRef.current;
      setVisible((prev) => (prev === next ? prev : next));
    };

    // No IntersectionObserver: assume the element IS on screen and fall back to
    // the tab signal alone. Degrading to "always visible" costs a consumer some
    // off-screen work; degrading to "never visible" would silently disable it
    // for good, and throwing here would take the whole host tree down with it.
    const canObserve = typeof IntersectionObserver !== "undefined";
    intersectingRef.current = !canObserve;

    const observer = canObserve
      ? new IntersectionObserver(
          ([entry]) => {
            intersectingRef.current = entry?.isIntersecting ?? false;
            update();
          },
          { threshold },
        )
      : null;

    observer?.observe(target);
    document.addEventListener("visibilitychange", update);
    update();

    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [elementRef, threshold]);

  return visible;
}
