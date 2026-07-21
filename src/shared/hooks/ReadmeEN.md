# `hooks` — misc generic React helpers

A small bucket for generic React utilities that belong to no domain.

- `useIsomorphicLayoutEffect` — `useLayoutEffect` in the browser,
  `useEffect` on the server (SSR-safe: avoids the layout-effect warning
  during server render).

Pure, dependency-free. Add here only things that are genuinely cross-cutting.
