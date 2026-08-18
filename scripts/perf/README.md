# perf

Browser-level observation. Not part of `npm test`: it measures what Chrome does
(commit, layout, raster, image decode, frame pacing), so it needs a real browser
and its own command.

```
npm run perf:first-ride
```

Builds, serves `dist` through `vite preview`, drives a headless Chrome over the
DevTools Protocol at CPU ×6 on a Fast-3G link, and clicks "next" eight times —
two full circles at the demo's desktop layout, with NO settling pause before the
first click, because a person does not pause.

## It reports; it does not pass or fail

Deliberately. The thing worth catching is a race: the image buffer must not
mount into a deck that is animating. Whether it *would* depends on how the
band's load times against the click, and both outcomes were observed on unfixed
code —

* on a fast link the band finishes ~250ms in, squarely inside the 2.5s ride, and
  the buffer lands in moving frames;
* on the slow link this script uses it finishes after the ride is already over,
  and the same unfixed code looks clean.

A gate that green-lights unfixed code half the time is worse than no gate. The
invariant itself is asserted where it can be asserted deterministically, in
`slides/tests/useSlideFetchReach.test.tsx`.

## Reading a run

```
when images were mounted into the track:
  + 3 <img>  ride 0                 WHILE MOVING     <- the page being ridden to
  +24 <img>  before the first click at rest          <- the buffer, healthy
```

The buffer is the big one — every buffered slide in a single commit. `WHILE
MOVING` next to it is the defect: that commit, its fetches and its decodes all
land in frames being animated.

The two circles should cost the same but for the deck's one-time decodes, which
belong to the first.

## Knobs

| Variable | Default | |
|---|---|---|
| `PERF_CPU` | `6` | CPU throttle; 6 approximates the reported tablet |
| `PERF_CLICKS` | `8` | two circles at `visibleSlides: 3` |
| `PERF_RIDE_MS` | `3200` | wait per ride: `durationStep` plus settle |
| `CHROME_PATH` | — | set when Chrome is somewhere unusual |
