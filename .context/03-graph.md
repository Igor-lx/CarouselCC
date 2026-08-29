# 03-graph — слои и связи

Кто кого импортирует, через какие точки входа и что ломается от смены
контракта. Счётная часть — `node .context/graph.mjs`; здесь то, что скрипт не
скажет: где проходят границы и какие связи несущие.

**Заполняется послойно.** Ниже — разобранные слои; остальные появятся по мере
проходов.

## Порядок слоёв

Снизу вверх, по направлению импортов (нижний ничего не знает о верхнем):

```
domain ──> state ──> motion / visual-position ──> geometry ──> компоненты
   └────────────────────────────────────────────> modules, slides, presentation
config ──> (всё, что читает настройки)
shared/** ─ полки, импортируются откуда угодно, сами не импортируют клиент
```

## C. `client/domain/**`

**Импортируют: 34 файла** — самый широко потребляемый слой. Смена сигнатуры
здесь задевает больше всего кода, поэтому радиус проверяется до правки:
`node .context/graph.mjs blast`.

По слоям потребителей:

| Слой | Что берёт |
| --- | --- |
| `state` (`initial`, `reconcile`, `reducer`, `transitions`, `types`) | `CarouselLayout`, `pageStart`, `clamp`, `normalizePageIndex`, `reconciledPageIndex`, `loopedSlideIndex` |
| `slides` (`useCarouselSlideDeck`, `useSlideRenderModel`, `useSlideFetchReach`, `SlideItem`, `imageResource/*`) | записи колоды, окно рендера, флаги видимости, `resolveRenderedImageSrc`, `laneDistanceFromBand` |
| `geometry` (`useSlotSizeSource`, `useTrackBinding`) | `measureSlotSize`, `trackPixelTransform` |
| `gesture` (`useCarouselGesture`) | `resolveDragRelease`, `pointerVelocityToVirtual`, `pageContaining` |
| `presentation` (`cssVars`, `useCarouselPresentation`) | `slideLane`, типы |
| `modules/Pagination/basic` (`fadeKeyframes`, `usePaginationFade`) | `mod`, типы |
| `config/resolve/buildConfig` | `DRAG_RELEASE_EPSILON` |
| `modules/Diagnostic/checks/constantChecks` | `DRAG_RELEASE_EPSILON` (сверка опубликованного значения) |
| `Carousel.tsx` | `laneDistanceFromBand`, `buildCarouselLayout`, типы |

**Точка входа — `domain/index.ts`**, но две вещи ходят мимо неё прямо в файл:
`DRAG_RELEASE_EPSILON` (нет в бочке) и `clampedVisibleSlidesCount` (есть в
бочке, но внутри слоя импортируется напрямую). Убирать файл `dragRelease.ts` или
менять его путь нельзя, не поправив два внешних импорта.

**Куда `domain` импортирует сам:** только `public-api/types` (тип `Slide`) и
`shared` (тип `PointerSwipeDirection` в `dragRelease`). React и DOM — нет, кроме
`measureSlotSize`, который читает DOM по переданному элементу.
