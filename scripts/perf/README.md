# perf

Browser-level probes. Not part of `npm test`: these measure what Chrome does
(commit, layout, raster, image decode, frame pacing), so they need a real
browser and their own command.

```
npm run perf:first-ride
```

Builds, serves `dist` through `vite preview`, drives a headless Chrome over the
DevTools Protocol at CPU ×6 on a Fast-3G link, and clicks "next" eight times —
two full circles at the demo's desktop layout.

## What `first-ride` asks

**Does the deck's one-time warm-up land inside the user's first interaction?**

There is NO settling pause before the first click, because a person does not
pause. Ride 0 is compared against ride 4 — the same page one circle later, with
everything already fetched and decoded. The two should be indistinguishable.

Gated on two numbers:

| Metric | Rule | Why |
|---|---|---|
| `dropped` | ride 0 ≤ 2× ride 4 | frames longer than 34 ms are what a person calls a freeze |
| `decode` | ride 0 must be **0** | a warm ride decodes nothing; a decode here means warm-up work ran inside the ride |

`layout` and `commit` are printed for context but not gated — at this bucketing
they are per-frame compositor work and sit at roughly the same count on every
ride, so they discriminate nothing.

## Knobs

| Variable | Default | |
|---|---|---|
| `PERF_CPU` | `6` | CPU throttle; 6 approximates the reported tablet |
| `PERF_CLICKS` | `8` | two circles at `visibleSlides: 3` |
| `PERF_RIDE_MS` | `3200` | wait per ride: `durationStep` plus settle |
| `CHROME_PATH` | — | set when Chrome is somewhere unusual |

## Reading a failure

`decode: ride 0 = 24` means twenty-four images were decoded while the deck was
moving. They are the buffer's, and they should have been decoded before the
deck could move at all.
