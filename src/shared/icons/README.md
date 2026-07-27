# icons

Self-contained inline SVG icon components — no icon font, no external asset.

## API

- **`ChevronIcon`** — props: `direction: "right" | "left" | "up" | "down"`
  (rotates one path) and an optional `className`. Fills with `currentColor` and
  is `aria-hidden` / non-focusable by default.

## Usage

```tsx
<ChevronIcon direction="left" className={styles.arrow} />
```
