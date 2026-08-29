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

## B. `client/config/**`

Точка входа — `config/index.ts`, но она **не единственный путь** от константы к
коду. Настройка попадает к потребителю одним из двух способов, и правка обязана
знать, каким именно:

- **через `CarouselRuntimeConfig`** — `buildCarouselConfig` собирает объект,
  `useCarouselConfig` его мемоизирует, дальше он лежит в состоянии редьюсера
  (ADR-004) и расходится оттуда;
- **прямым импортом константы** — так читают `FALLBACK_DROP_EVERY_NTH_FRAME`,
  `REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES`, `IMAGE_RETRY`, `SLIDE_REORIENT_VEIL`,
  оси вьюпорта и булевы дефолты. Полный список потребителей — в `00-map.md`,
  раздел B.

**Обратная связь: три значения рантайм-конфига живут вне `config/`** и
втягиваются в `buildConfig` из своих слоёв — `MOTION_EPSILON` (motion),
`DRAG_RELEASE_EPSILON` (domain), `GESTURE_COAST_MAX_MS` (gesture). То есть
`config` импортирует из `domain`, `motion` и `gesture`, хотя по порядку слоёв
он ниже. Это не цикл (те три файла ничего из `config` не берут), но связь,
которую легко не заметить при переносе файла.

`modules/Diagnostic/checks/constantChecks.ts` импортирует **всё** перечисленное
разом: он сверяет опубликованные значения, поэтому при переименовании любой
константы падает он, а не потребитель.

## E–F. `client/motion/**` и `client/visual-position/**`

**Motion: 22 потребителя, visual-position: 10.** Но связь здесь не «импорт
функции», а **две шины**, и это главное отличие слоя от остальных:

| Шина | Кто публикует | Кто слушает | Через что |
| --- | --- | --- | --- |
| план движения | `useMotionRunner` | `geometry/useTrackBinding`, `modules/Pagination/basic/usePaginationFade`, `modules/Pagination/widget/usePaginationWidgetBinding` | `planChannel` — наблюдаемая **вне React**, публикация не вызывает ре-рендер |
| видимая позиция | контроллер в `useVisualPosition` | те же три плюс `Carousel.tsx` | `VisualPositionSource.subscribe` — тоже вне React |

Из этого следует то, чего не видно в импортах: **добавить потребителя краски
можно, не трогая ни один из этих файлов**, а сломать всех сразу — изменив форму
плана или кадра.

`motion/index.ts` дополнительно **реэкспортирует пять функций полки**
`shared/engines/motion`, чтобы у модулей карусели был один корень импорта для
всего, что касается движения. То есть часть «потребителей motion» на деле
потребляет полку через него.

**Зависимости вверх и вбок:** `motion/timing` читает `config`;
`motion/duration` и `segmentFactory` читают типы `state`; `useMotionRunner`
читает `geometry` (тип `TrackBindingApi`) и `gesture/coast`. Обратно
`state/transitions` берёт из `motion/timing` план телепорта — единственная
петля «состояние ↔ движение», и она намеренная: числа перелёта обязаны быть
одни и те же по обе стороны.

## D. `client/state/**`

**Зависят 17 файлов**, и зависимость двух разных сортов:

| Что берут | Кто |
| --- | --- |
| `dispatch` (нужна **неизменная идентичность**) | `autoplay/useCarouselAutoplay`, `gesture/useCarouselGesture`, `navigation/useCarouselNavigation`, `motion/useCarouselMotionExecution` |
| `state` / `motionStatus` (чтение) | `Carousel.tsx`, `context/*` (значения контекстов модулей), `motion/segmentFactory`, `motion/duration`, `motion/useMotionRunner`, `modules/Diagnostic/checks/stateChecks` |

Наружу (`state/index.ts`) выходит узко: `useCarouselState`, `motionStatus` и
четыре типа. `carouselReducer`, `buildInitialState`, `resolveStepTransition`,
`validateCarouselState` берут прямым путём — тесты, диагностика и мотор.

**Зависимость вверх, единственная в слое:** `transitions.ts` импортирует
`resolveGoToPlan` из `motion/timing`. Планирование телепорта живёт в motion, а
решение о нём принимается здесь — при переносе любого из двух файлов это первое,
что порвётся.

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
