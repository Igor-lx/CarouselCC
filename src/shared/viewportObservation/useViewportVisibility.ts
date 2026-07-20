import { useRef, useState, type RefObject } from "react";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";

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

    const observer = new IntersectionObserver(
      ([entry]) => {
        intersectingRef.current = entry?.isIntersecting ?? false;
        update();
      },
      { threshold },
    );

    observer.observe(target);
    document.addEventListener("visibilitychange", update);
    update();

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [elementRef, threshold]);

  return visible;
}
