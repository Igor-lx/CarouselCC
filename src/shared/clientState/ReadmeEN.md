# `clientState` — what the client reports about itself, reactively

Hooks that read the live state of the user's client — viewport and user
preferences — and re-render when it changes. Two domains plus the one store
they share:

| Folder | Purpose |
| --- | --- |
| `shared/` | **The store.** `useMediaQuery` — one `matchMedia` listener per query, shared by everyone here. Exactly one copy per project. |
| `media/` | Viewport conditions: width tiers, orientation, media queries. A `library/` of single hooks + a `useMedia/` facade. |
| `environment/` | User signals: reduced-motion, touch, data-saver. A `library/` of single hooks + a `useUserEnvironment/` facade. |

**Principle.** Each blank keeps its own copies of the hooks it uses, so you
can copy any one folder out on its own. The single exception is the store in
`shared/` — a second copy would split the listener registry, so it stays
single and lives in plain sight.
