# clientState

Hooks that read the live state of the user's client — viewport and user
preferences — and re-render when it changes. Two domains plus the one store they
share:

| Folder | Purpose |
| --- | --- |
| `sharedStore/` | **The store layer.** `useMediaQuery` (one `matchMedia` listener per query) and `useMediaQuerySet` (a whole list folded into one subscription). Shared by everyone here; exactly one copy per project; taken as a WHOLE folder. |
| `media/` | Viewport conditions: width tiers, orientation, media queries. A `library/` of single hooks + a `useMedia/` facade. |
| `environment/` | User signals: reduced-motion, touch, data-saver. A `library/` of single hooks + a `useUserEnvironment/` facade. |

**Principle — a storage of blanks, not a dependency graph.** Each blank keeps
its own copies of the hooks it uses, so you can copy any one folder out on its
own. The single exception is `sharedStore/`, and its name says both halves of
the rule: it is a STORE (a second copy would split the listener registry, and
the same condition would be watched twice), and it is SHARED (it travels with
whatever blank you lift out — always, whole, without choosing between its
files).
