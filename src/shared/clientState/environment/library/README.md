# environment/library

Standalone user-environment signal hooks; take the one you need. Grouped by
meaning, not mechanism — they answer "what is this user's environment", even
though only one is a media query.

| Hook | Returns | Source |
| --- | --- | --- |
| `useIsReducedMotion()` | `boolean` | `(prefers-reduced-motion: reduce)` — rides `../../shared/useMediaQuery` (copy that too). |
| `useIsTouchDevice()` | `boolean` | `(pointer: coarse)` OR the first touch `pointerdown`; own store. |
| `useDataSaver(enabled?)` | `boolean` | `(prefers-reduced-data: reduce)` OR the Network Information API `saveData`; own store. |

## Notes

- **Store lifecycle.** The own-store hooks (`useIsTouchDevice`, `useDataSaver`)
  follow the same contract as `shared/useMediaQuery` — a lazy live read on the
  first `getSnapshot` (React reads it during render, before subscribing, so a
  cached `false` would be wrong for the whole first frame) and attach/detach
  gated on the subscriber count. See [`../../shared/README.md`](../../shared/README.md).
- **`useDataSaver` is for SPECULATIVE work only** (e.g. image warm-up). It must
  never gate correctness-critical work — error handling, retries, or anything the
  user actually sees. Pass `enabled = false` to call it unconditionally (Rules of
  Hooks) without subscribing, when the caller's own feature is inactive.
- **`useIsTouchDevice` first frame matters:** a consumer that latches the first
  value (`useState(isTouch)`) would be stuck wrong forever if the first read were
  cached `false` — hence the lazy live read.
