# media/library

Standalone media hooks. Individual hooks; take the one you need. All ride `../../sharedStore/`
(copy that file along too).

| Hook | Returns | Use |
| --- | --- | --- |
| `useBreakpoint(table)` | `{ name, pick }` | Active width-tier name for a `{ name: minWidthPx }` table, plus `pick({...})` to map a value per tier. `resolveActiveBreakpoint`/`STANDARD_BREAKPOINTS` exported alongside. |
| `useOrientation()` | `"portrait" \| "landscape"` | Viewport orientation (width vs height). |
| `useShortLandscape()` | `boolean` | Landscape AND short in HEIGHT — a handheld held sideways (`SHORT_LANDSCAPE_QUERY`). |

```ts
const cols = useBreakpoint(STANDARD_BREAKPOINTS).pick({ desktop: 3, mobile: 1, DEFAULT: 2 });
```

Names/thresholds are the caller's; breakpoints resolve purely by number
(largest matching wins), so order and naming never shadow a wider tier.
