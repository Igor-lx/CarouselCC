# sharedStore

The name carries the whole rule. It is a **store** — state with a listener
registry, which is the one thing here that a second copy would break. And it is
**shared** — it travels with whatever you lift out of `clientState`, always,
as one folder.

`useMediaQuery(query)` → live `boolean`. A single reactive `matchMedia` store:
one browser listener per distinct query string, shared by every consumer, with a
correct first-render read and an SSR-safe fallback.

```ts
const isWide = useMediaQuery("(min-width: 1024px)");
```

`useMediaQuerySet(queries)` → one bit per query, as a string. Use it whenever
the NUMBER of conditions is data rather than a constant. Calling
`useMediaQuery` in a loop would tie the hook count to the length of that data,
and a list that grows between renders then breaks React's hook order — with an
error that names neither the hook nor the list. The set store subscribes to the
same per-query stores underneath, so nothing is watched twice.

```ts
const bits = useMediaQuerySet(tierQueries); // "010" — changes iff a verdict does
```

`getMediaQueryStore(query)` and `getMediaQuerySetStore(queries)` are the raw
stores behind them — deep import only (not the shared barrel), for non-React
consumers and the lifecycle tests.

## Taking it: the folder, whole, always

**The unit here is the FOLDER, not the file.** Whatever you take from
`clientState` — one hook or all of them — copy this folder next to it, entire.
There is no case analysis to do, and nothing inside it is optional: cherry-pick
`useMediaQuery.ts` because your hook "only needs a boolean" and the day someone
reaches for `useBreakpoint` or `useMedia` you are missing a file.

Deliberately, the price of that is small and one-directional. `useMediaQuerySet`
imports `useMediaQuery`; nothing imports the other way. So a project that never
watches a set carries one unused module, which any bundler drops — while a
project that does watch one never discovers a missing dependency.

**Why a store cannot be duplicated the way the hooks are.** Every other blank
copies its hooks so it can travel independently. A store cannot: a second copy
keeps its own listener registry, so the same query would be watched twice and
"one listener per query" would hold only per copy. That is why the sets fold
over the per-query stores in here rather than opening their own `matchMedia` —
two different sets naming the same condition still share one browser listener.

**What is machine-checked and what is not.** That this folder depends on
NOTHING but React and itself — the property that makes "copy the folder" work —
is a direction rule in `.context/03-graph.md`, verified by
`node .context/graph.mjs verify`. That a project keeps exactly one copy is not:
it is a copying convention, and nothing breaks until someone actually clones the
folder.

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
