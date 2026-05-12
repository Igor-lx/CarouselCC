import { useEffect, useState } from "react";

const QUERY = "(orientation: landscape) and (max-height: 520px)";

/**
 * Tracks the demo-specific "compact landscape" condition used to pick a
 * different visible-slides count and to fall back to desktop imagery.
 */
export function useCompactLandscape(): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia(QUERY);
    const sync = () => setActive(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return active;
}
