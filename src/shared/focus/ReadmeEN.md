# `focus` — focus recovery helper

`manageFocusShift(container)` — when the currently focused element has been
hidden inside an `inert` subtree (e.g. after a carousel settle moved the
active band), move focus to the in-band focusable element instead, falling
back to the container. Generic: it keys off a `data-active-zone="true"`
marker and an `[inert]` ancestor, so any host can adopt the convention.

Pure DOM, no React, no state.
