/**
 * THE BLANK'S OWN COPY — kept so this folder can be lifted into an empty
 * project and work with nothing else copied along.
 *
 * DORMANT IN THIS REPO: the project already provides the same helper
 * (shared/hooks/useIsomorphicLayoutEffect), so useViewportVisibility imports
 * THAT one — one helper, one import path. tests/singleSource.test.ts enforces
 * it. When lifting this folder out, point that import back at this file.
 */
import { useEffect, useLayoutEffect } from "react";

export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;
