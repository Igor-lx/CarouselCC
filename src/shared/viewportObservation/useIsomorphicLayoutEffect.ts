// Dormant local copy for standalone lift-out; the repo imports the shared one.
// Do NOT delete. See ./README.md
import { useEffect, useLayoutEffect } from "react";

export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;
