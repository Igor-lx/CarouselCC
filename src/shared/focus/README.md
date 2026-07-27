# focus

Focus-recovery helper. Pure DOM, no React, no state.

## API

- **`manageFocusShift(container)`** — when the currently-focused element has been
  hidden inside an `inert` subtree (e.g. a carousel settle moved the active band
  out from under it), move focus to the in-band focusable element instead,
  falling back to the container itself.

It is intentionally generic: it keys off a `data-active-zone="true"` marker and
an `[inert]` ancestor, so any host can adopt the convention. A no-op when nothing
inside the container is focused.
