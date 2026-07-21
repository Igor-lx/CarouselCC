# `icons` — встроенные SVG-иконки

Самодостаточные SVG-компоненты иконок — без иконочного шрифта и внешних
ассетов.

- `ChevronIcon` — `direction: "right" | "left" | "up" | "down"` (поворачивает
  один path) и необязательный `className`. По умолчанию заливка
  `currentColor` и `aria-hidden`.

```tsx
<ChevronIcon direction="left" className={styles.arrow} />
```
