# hooks

Generic, dependency-free React helpers that belong to no domain. Add something
here only when it is genuinely cross-cutting.

## Exports

- **`useIsomorphicLayoutEffect`** — `useLayoutEffect` in the browser, `useEffect`
  on the server. SSR-safe: sidesteps React's "layout effect on the server"
  warning while still running before paint on the client.
