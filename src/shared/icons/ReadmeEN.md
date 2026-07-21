# `icons` — inline SVG icons

Self-contained SVG icon components — no icon font, no external asset.

- `ChevronIcon` — `direction: "right" | "left" | "up" | "down"` (rotates one
  path), plus an optional `className`. `currentColor` fill and `aria-hidden`
  by default.

```tsx
<ChevronIcon direction="left" className={styles.arrow} />
```
