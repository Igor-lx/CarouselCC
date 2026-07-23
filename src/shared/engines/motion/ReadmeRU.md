# `motion` — красиво провести значение

Самодостаточный, независимый от жестов движок анимации: всё, чтобы
анимировать ОДНО числовое значение — позицию, прозрачность, угол. Палец не
нужен (автоплей, клики, программное движение). Вся поверхность экспортируется
из `index.ts`.

## Устройство

| Папка | Роль |
| --- | --- |
| `profile/` | Математика кривых: профили разгон/круиз/торможение из скоростей и долей дистанции; WAAPI percent-stops; солвер пиковой скорости под длительность. |
| `runtime/` | Исполнение: RAF-контроллер, часы движения (`motionNow`), подписка отрисовки (`useMotionPaint`). |
| `compositor/` | Доставка в композитор браузера: примитив pinned-анимации и готовый one-element-райдер (`useCompositedRide`). |
| `tests/` | Свой сьют, включая `portability.test.ts`. |

Самодостаточен: импортирует только React и себя (стережёт
`tests/portability.test.ts`), копируется в любой проект как есть.

## Принцип

- **Рантайм не имеет мнения о кривых** — он исполняет любой сэмплер
  `(segment, timestamp) → sample`; `profile/` — один (хороший) способ их строить.
- **Одно значение на контроллер**; хореография нескольких — это композиция.
- **Ноль React-ре-рендеров** — состояние в замыкании; читается через
  `subscribe` и снапшот-геттеры, не через рендер.
- **Один домен часов** — каждый `startedAt` штампуется `motionNow()`.

## Быстрый старт

```tsx
const controller = useMotionController(0, "idle");
useEffect(() => controller.subscribe(({ value }) => paint(value)), [controller]);
controller.start({ segment, sampler, onComplete });
```

`useMotionController` владеет инстансом на время жизни компонента
(StrictMode-безопасно); `createMotionController` — тот же движок без React.

## Ключевые экспорты

| Экспорт | Что |
| --- | --- |
| `useMotionController` / `createMotionController` | Рантайм, с React / без. |
| `motionNow` | ЧАСЫ движения (`performance.now()`, SSR-безопасно). |
| `buildProfile`, `createMotionProfile` | Кривые разгон/круиз/торможение. |
| `profileProgressStops`, `resolvePeakSpeedForDuration`, `isWaapiSupported` | Транспорт WAAPI-кейфреймов. |
| `startPinnedAnimation`, `useCompositedRide` | Доставка в композитор + one-element-райдер. |
| `useMotionPaint` | Хук подписки отрисовки (путь JS-фолбэка). |

## Связка с `gesture`

Палец тащит значение, отпускание катит его по кривой — движки соединяются
ОДНИМ структурным швом: `ride.dragBinding()` в проп `value` хука жеста, никогда
импортом (см. README `gesture`). Для нуля швов — один хук, всё слито — берётся
заготовка `kinetic`.
