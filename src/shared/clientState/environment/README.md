# environment

What the user's setup and preferences report. Grouped by meaning, not mechanism.

| Folder | Contents |
| --- | --- |
| `library/` | Single hooks: `useIsReducedMotion` (media query), `useIsTouchDevice` (pointer detection), `useDataSaver` (Network Information API). |
| `useUserEnvironment/` | Facade: the three signals as one memoised object, read once at an app boundary. |

Only `useIsReducedMotion` touches the shared store (`../shared/useMediaQuery`);
the other two keep their own tiny sources.
