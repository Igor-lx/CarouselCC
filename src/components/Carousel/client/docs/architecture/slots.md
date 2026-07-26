# Slots

The slot vocabulary: the fixed set of named regions a module can attach to
(`pagination`, `controls`, `diagnostic`, `responsive-images`) and the type that
brands a component with the slot it targets.

A module is a normal component tagged with a `slot` field (`CarouselSlotComponent`).
The carousel discovers its children by that tag rather than by element order or
prop wiring, so a host composes modules declaratively — drop `<Controls />` and
`<Pagination />` in as children, in any order — and the carousel routes each to
its region. `CAROUSEL_SLOTS` is the closed `as const` list, so `CarouselSlotName`
is a literal union and an unknown slot name is a compile error.

This folder is pure contract: names and a branding type, no behaviour. The
*decision* of whether a slotted module renders lives in
[render-policy](./render-policy.md); the discovery/routing that reads the `slot`
tag lives in [modules](./modules.md).
