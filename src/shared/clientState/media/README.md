# media

Reactive CSS media conditions. Everything that answers "does this media condition hold right now" — width
tiers, orientation, arbitrary queries. Two ways to take it:

| Folder | Take it when |
| --- | --- |
| `library/` | You want ONE thing: a breakpoint, orientation, or a single media query. Grab that hook. |
| `useMedia/` | You want a whole SET resolved at once (tiers + orientation + flags) behind one call and one change signal. |

Both sit on `../shared/useMediaQuery`. The facade keeps its own copies of the
library hooks (so it lifts out independently), but a project still runs one
store.
