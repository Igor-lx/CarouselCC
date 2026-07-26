# Module render policy

The single owner of *whether each slot module is attached and allowed to
render*. Every slot child (Controls, Pagination, ResponsiveImages, Diagnostic)
passes through here and comes out either resolved or replaced with `null`. The
view then renders the resolved children directly and carries no module
conditionals of its own — the decision lives in exactly one place, not scattered
as `&&` guards across the tree.

`useModuleRenderPolicy` returns both the attachment flags (`hasControlsSlot`,
`hasPaginationSlot`, …, and `isDiagnosticActive`) and the gated `slots` object.
The flags exist so Diagnostics can audit the host's wiring — e.g. warn about a
prop that only means something when its module is attached.

## The gating rules

- **Controls and pagination — one symmetric rule.** A module renders only when
  its flag is on, its slot is attached, AND the deck can actually slide
  (`canSlide`). A single-page deck has no destination for edge controls or dots,
  so both are gated to `null` here. Because the gate lives in the policy, the
  slot modules never mount in a no-op state and need no internal
  "single page" guard of their own.
- **ResponsiveImages — headless, presence-switched.** It renders whenever
  attached; its mere PRESENCE is the switch that turns the responsive-image
  stack on. No flag, no `canSlide` dependency.
- **Diagnostic — attached-only, and dev-only.** It renders whenever attached and
  only reports observations, so it is never gated on `canSlide`. But its
  attachment is resolved through `IS_DEV`: see below.

## Diagnostic is a development tool, end to end

The Diagnostic module renders nothing, mutates nothing, and its only output is
`console.warn`, which is already dev-only. Gating its **attachment** here makes
that true of its cost as well: in production its slot never mounts, never
consumes the diagnostic context, and never re-renders on a dispatch. The two
frames the carousel spends main-thread time in — the click frame and the settle
window — are dominated by React rendering this subtree, so a component that
produces nothing shipped must not be in it. This lets a host leave
`<Diagnostic />` in its JSX permanently: it simply costs nothing in production.

Attachment as the runtime sees it is therefore `hasDiagnosticSlot && IS_DEV`,
and that resolved value is what feeds both `isDiagnosticActive` and the gated
`diagnostic` slot.

## Why one memoised object

The whole result is memoised against every input, so the view receives a stable
`slots` object and stable flags. A module silenced by the policy is `null`, and
a change in any gate re-resolves all of them together — the policy is the owner
of the *decision*, not merely of the booleans behind it.
