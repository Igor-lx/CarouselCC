# Navigation

The public command surface: the handlers a user's click ultimately reaches —
previous, next, jump-to-page, slide click — and the two low-level intents
(`move`, `goTo`) that autoplay and other layers share. It is a thin, pure
dispatch adapter with no state of its own; every handler turns an interaction
into one reducer command.

## Two intents, several handlers

- **`move(step, reason)`** dispatches a `MOVE` — a relative step (±1 pages for
  controls and gesture, larger for nothing here). `handlePrev` / `handleNext`
  are `move(-1)` / `move(+1)` with reason `"click"`.
- **`goTo(pageIndex, reason)`** dispatches a `GO_TO` — an absolute page.
  `handlePageSelect` is `goTo(page, "click")`; autoplay's loop-back is
  `goTo(0, "autoplay")`.

Every dispatch carries `moveReason` (`click` / `gesture` / `autoplay`) so the
motion layer can pick the right profile, and `fromVirtualIndex` read live from
`readCurrentPosition()` so a command issued mid-ride hands off from the actual
visible position, not a stale logical one.

## Decisions

- **`enabled` short-circuit.** When navigation is disabled every intent returns
  without dispatching, so a stale handler reference captured by a module cannot
  drive the deck.
- **Slide click is a pass-through.** `handleSlideClick` only forwards to the
  host's optional `onSlideClick` — the carousel attaches no navigation meaning
  to tapping a slide; that is the product's call.
- **Referential stability.** All handlers are memoised (against `dispatch`,
  `enabled`, `readCurrentPosition`, and the two intents) and returned as one
  frozen `CarouselNavigation` object, because they flow into the dependency
  arrays of autoplay and the modules — a fresh identity per render would churn
  those consumers' effects.
