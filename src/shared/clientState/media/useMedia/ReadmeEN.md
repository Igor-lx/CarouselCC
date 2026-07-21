# `useMedia` — the media facade

One call resolves a whole set of media axes at once.

```ts
const m = useMedia({ breakpoints: { desktop: 1024, mobile: 0 }, flags: { tall: "(orientation: portrait)" } });
// m.breakpoint  -> "desktop" | "mobile"
// m.orientation -> "portrait" | "landscape"
// m.flags.tall  -> boolean
// m.matches(q)  -> ad-hoc query check
// m.signature   -> changes iff any tracked verdict changes (a stable effect dep)
```

**Layout.** `internal/` holds the facade's OWN copies of the hooks it uses
(the breakpoint resolver, orientation queries) plus its glue; `useMedia.ts` is
the one facade hook; `index.ts` is the public surface. Copying this folder
leaves nothing behind — except the store: it imports
`../../shared/useMediaQuery`, which stays single per project (take that file
along).
