# `environment/library` — отдельные хуки-сигналы

Одиночные хуки; берёшь нужный.

| Хук | Возвращает | Источник |
| --- | --- | --- |
| `useIsReducedMotion()` | `boolean` | `(prefers-reduced-motion: reduce)` — стоит на `../../shared/useMediaQuery` (его тоже копируем). |
| `useIsTouchDevice()` | `boolean` | Первый `pointerdown` касания/пера; свой стор. |
| `useDataSaver()` | `boolean` | Флаг `saveData` из Network Information API; свой стор. |

Группировка по смыслу, а не механизму: все отвечают на «каково окружение
пользователя», хотя медиазапрос лишь один из них.
