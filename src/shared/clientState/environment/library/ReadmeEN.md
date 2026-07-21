# `environment/library` — standalone signal hooks

Individual hooks; take the one you need.

| Hook | Returns | Source |
| --- | --- | --- |
| `useIsReducedMotion()` | `boolean` | `(prefers-reduced-motion: reduce)` — rides `../../shared/useMediaQuery` (copy that too). |
| `useIsTouchDevice()` | `boolean` | First `pointerdown` of a touch/pen; own store. |
| `useDataSaver()` | `boolean` | Network Information API `saveData`; own store. |

Meaning, not mechanism: they answer "what is this user's environment", even
though only one is a media query.
