# `useUserEnvironment` — the environment facade

One hook returns a single memoised object of the environment signals — read
it once at an application boundary and inject it where needed (the carousel
takes it as a `userEnvironment` prop, and never detects the environment
itself).

```ts
const env = useUserEnvironment();
// env.reducedMotion, env.touch, env.dataSaver  (stable object identity)
```

**Layout.** `internal/` holds the facade's OWN copies of the three signal
hooks, so the folder lifts out whole. The only shared piece is the store
`../../shared/useMediaQuery` (reduced-motion rides it) — keep it single.
