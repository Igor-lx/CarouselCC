# slots

Resolve React `children` into named slots, so a component can accept composable
sub-parts positionally-free (any order, any subset) and read them by name.

## API

- **`resolveSlots(children, slotNames)`** — returns a record keyed by
  `slotNames`. A child is assigned to a slot when its component carries a
  matching `type.slot` tag. Last child wins; a missing slot comes back as
  `null`; an unknown slot is dropped (and warned in dev), as are duplicate
  children for one slot.

## Usage

```ts
const { header, footer } = resolveSlots(children, ["header", "footer"] as const);
```

A component opts into a slot by tagging itself: `MyHeader.slot = "header"`.
