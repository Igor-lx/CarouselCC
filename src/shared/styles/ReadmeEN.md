# `styles` — style-map merge

`mergeStyleMaps(...maps)` — combine several CSS-module maps by concatenating
the class strings per key. Lets a component overlay caller-supplied class
overrides on top of its own module map without losing the originals.
`null`/`undefined` maps and empty values are skipped.

```ts
const cls = mergeStyleMaps(ownStyles, props.classNames);
// cls.track === "own_track abc123 userTrack"
```
