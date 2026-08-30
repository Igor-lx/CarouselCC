# useUserEnvironment — the environment facade

One hook returns a single **memoised** object of the environment signals — read
it once at an application boundary and inject it where needed (the carousel takes
it as a `userEnvironment` prop and never detects the environment itself).

```ts
const env = useUserEnvironment();
// env.reducedMotion, env.touch, env.dataSaver  (stable object identity)
```

The object is memoised on the three primitive signals, so its identity changes
only when a signal actually flips — never on an unrelated host re-render. That
keeps it safe to pass straight into a `React.memo` component without defeating
the memo boundary. The three single-signal hooks remain individually available
(from `../library`) for callers that need just one.

**Layout.** `internal/` holds the facade's OWN copies of the three signal hooks,
so the folder lifts out whole. The only shared piece is the store
`../../sharedStore/` (reduced-motion rides it) — keep it single.
