# media

Reactive CSS media conditions. Everything that answers "does this media condition hold right now" — width
tiers, orientation, arbitrary queries. Two ways to take it:

| Folder | Take it when |
| --- | --- |
| `library/` | You want ONE thing: a breakpoint, orientation, or a single media query. Grab that hook. |
| `useMedia/` | You want a whole SET resolved at once (tiers + orientation + flags) behind one call and one change signal. |

Both sit on `../sharedStore/`. **Take that folder whole, always** — it is the one
thing here that is never duplicated, and which of its two hooks you end up
using is not a decision you should have to make while copying.

Neither `useBreakpoint` nor `useMedia` cares how its table or axes are built:
tiers and flags are watched through a single subscription, so their COUNT never
reaches React's hook counter. Build them inline, from state, from a fetched
config.
