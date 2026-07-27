# engines

Three self-contained blanks for animating a value and turning a finger into
intent. Each imports nothing but React and itself (a
`tests/portability.test.ts` guards it) — copy one folder and go.

| Folder | What it does |
| --- | --- |
| `motion/` | Make a numeric value travel beautifully: accel/cruise/decel curves + a RAF runtime. No finger. |
| `gesture/` | Turn a pointer drag into intent: swipe binding + inertial-release physics. No animation. |
| `kinetic/` | The turnkey fusion: one draggable, flyable value in ONE hook. Self-sufficient BY DUPLICATION — its `internal/` forks `motion` and `gesture`. |

**Rule.** Engines never import each other. `kinetic` carries its own forked
copies; the forks may drift from the standalone originals — by design.
Pick by task: value-only → `motion`; finger-only → `gesture`; both, simply →
`kinetic`; both, custom (a carousel-grade state machine) → `motion` + `gesture`
as primitives.
