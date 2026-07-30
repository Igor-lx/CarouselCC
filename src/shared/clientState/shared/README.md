# shared — the one store

`useMediaQuery(query)` → live `boolean`. A single reactive `matchMedia` store:
one browser listener per distinct query string, shared by every consumer, with a
correct first-render read and an SSR-safe fallback.

```ts
const isWide = useMediaQuery("(min-width: 1024px)");
```

`getMediaQueryStore(query)` is the raw store behind it — exposed by deep import
only (not the shared barrel) for non-React consumers and the lifecycle tests.

## Why it lives here, alone

Every other blank duplicates its hooks so it can travel independently. A store
cannot: a second copy keeps its own listener registry, so the same query would
be watched twice and "one listener per query" would hold only per copy. Keep
exactly **one** `useMediaQuery.ts` in a project — this visible folder is the
reminder to take it along and not clone it. Not machine-enforced: it is a
copying convention, and nothing here breaks until someone actually clones the
file.

## Lifecycle contract

Each rule closes a real failure mode — do not relax them without reading the
tests:

- **Lazy live read on first `getSnapshot`.** React reads the snapshot during
  render, before it subscribes; a cached `false` there would paint the wrong
  layout for the first frame, so the first read goes live.
- **Permanent per-query singleton** — the store is never removed from the map.
  Deleting it on last-unsubscribe poisoned StrictMode/dev: hook instances hold a
  store reference captured at render time, so a delete-by-query could tear down a
  newer store for the same query, and every render then minted a fresh
  `matches: false` store (the layout oscillated and stuck on the mobile tier).
  The set of distinct queries is small and fixed; keeping entries is free.
- **Attach/detach gated on subscriber COUNT**, not on whether the
  `MediaQueryList` exists — a re-subscribe after a full teardown must re-attach
  the listener and re-sync from the live value, which a `!mediaQuery` gate
  silently skipped. While dormant, the store drops its `initialized` flag so the
  next consumer starts from a fresh live read.
