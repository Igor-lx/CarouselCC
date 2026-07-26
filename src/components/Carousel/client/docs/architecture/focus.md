# Focus recovery

Keyboard focus must never be stranded on a slide the user can no longer see. As
the deck moves, slides that leave the active band are made inert (an `inert`
subtree, aria-hidden), and if the element that held focus is inside one of them
the browser would keep focus on a hidden, non-interactive node — a dead spot for
keyboard and screen-reader users.

`useFocusRecovery` closes that gap. It runs one shared primitive,
`manageFocusShift` (from the shared library), which checks whether the active
element is now hidden inside an inert subtree and, if so, moves focus into the
new active band's first focusable target. The carousel layer only decides *when*
to run it.

## When it fires

It fires **on settle**, and only on a settle that changed the destination:

- `isIdle` must be true — recovery runs once the ride finishes, not on every
  intermediate frame, so focus is never yanked mid-motion.
- The trigger is deduplicated against the last `(isIdle, targetPageIndex)` pair.
  A settle that lands on the same page the last recovery already handled is a
  no-op, so an idle re-render cannot re-run the focus shift and steal focus the
  user deliberately placed.

The effect is a layout effect (`useIsomorphicLayoutEffect`) so the focus move
happens synchronously with the commit that made the old holder inert, before the
browser paints the intermediate state.

## What it deliberately does not do

It owns no focus policy of its own — where focus *should* land is entirely
`manageFocusShift`'s decision. This layer is purely the settle-edge detector, so
the accessibility behaviour stays defined in one shared place rather than being
re-implemented per component.
