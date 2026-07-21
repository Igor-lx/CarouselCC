# `media/library` — отдельные медиа-хуки

Одиночные хуки; берёшь нужный. Все стоят на `../../shared/useMediaQuery`
(его тоже копируем).

| Хук | Возвращает | Назначение |
| --- | --- | --- |
| `useBreakpoint(table)` | `{ name, pick }` | Имя активного тира для таблицы `{ имя: minWidthPx }` и `pick({...})` для значения по тиру. Рядом экспортируются `resolveActiveBreakpoint`/`STANDARD_BREAKPOINTS`. |
| `useOrientation()` | `"portrait" \| "landscape"` | Ориентация вьюпорта (ширина против высоты). |
| `useShortLandscape()` | `boolean` | Лендскейп И низкий по ВЫСОТЕ — телефон на боку (`SHORT_LANDSCAPE_QUERY`). |

```ts
const cols = useBreakpoint(STANDARD_BREAKPOINTS).pick({ desktop: 3, mobile: 1, DEFAULT: 2 });
```

Имена/пороги — на усмотрение вызывающего; брейкпоинты резолвятся чисто по
числу (побеждает наибольший подошедший), поэтому порядок и имена никогда не
затеняют более широкий тир.
