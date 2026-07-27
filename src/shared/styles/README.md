# styles

Style-map helpers. Pure, dependency-free.

## API

- **`mergeStyleMaps(...maps)`** — combine several CSS-module maps by
  concatenating the class strings per key. Lets a component overlay
  caller-supplied `className` overrides on top of its own module map without
  losing the originals. `null` / `undefined` maps and empty values are skipped.

## Usage

```ts
const cls = mergeStyleMaps(ownStyles, props.classNames);
// cls.track === "own_track abc123 userTrack"
```
