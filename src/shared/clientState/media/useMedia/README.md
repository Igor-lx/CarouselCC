# useMedia

The media facade. One call resolves a whole set of media axes at once.

```ts
const m = useMedia({ breakpoints: { desktop: 1024, mobile: 0 }, flags: { tall: "(orientation: portrait)" } });
// m.breakpoint  -> "desktop" | "mobile"
// m.orientation -> "portrait" | "landscape"
// m.flags.tall  -> boolean
// m.matches(q)  -> ad-hoc query check
// m.signature   -> changes iff any tracked verdict changes (a stable effect dep)
```

**Axes are data, not a constant.** Build them however you like — inline, from
state, from a fetched config. However many conditions a set holds, the facade
takes ONE subscription, so their count never reaches React's hook counter.

**Layout.** `internal/` holds the facade's OWN copies of the hooks it uses
(the breakpoint resolver, orientation queries) plus its glue: `axesDescriptor`
resolves a set of axes once per shape, which is what lets the caller rebuild
its axes object freely. `useMedia.ts` is the one facade hook; `index.ts` is the
public surface. Copying this folder leaves nothing behind — except the store
layer: take `../../shared/` along, whole and unedited (its README says why).
