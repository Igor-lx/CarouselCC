# `shared` — the one store

`useMediaQuery(query)` → live `boolean`. A single reactive `matchMedia` store:
one browser listener per distinct query string, shared by every consumer, with
a correct first-render read and SSR-safe fallback.

**Why it lives here, alone.** Every other blank duplicates its hooks so it can
travel independently. A store cannot: a second copy keeps its own listener
registry, so the same query would be watched twice and "one listener per
query" would hold only per copy. Keep exactly **one** `useMediaQuery.ts` in a
project — this visible folder is the reminder to take it along and not clone
it. `tests/singleStore.test.ts` enforces it.

```ts
const isWide = useMediaQuery("(min-width: 1024px)");
```
