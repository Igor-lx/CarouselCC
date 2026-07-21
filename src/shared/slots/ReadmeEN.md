# `slots` — children-to-slots resolver

`resolveSlots(children, slotNames)` — reads React `children` and returns a
record keyed by the known slot names. A child is assigned to a slot when its
component carries a matching `type.slot` tag; last child wins, unknown slots
are dropped (warned in dev), missing slots come back as `null`.

Lets a component accept composable sub-parts positionally-free (any order,
any subset) while reading them by name.

```ts
const { header, footer } = resolveSlots(children, ["header", "footer"] as const);
```
