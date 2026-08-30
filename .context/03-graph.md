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

## Правила направления — считаются, а не декларируются

Порядок слоёв выше — картинка; ниже то же самое в виде, который проверяет
`node .context/graph.mjs verify`. Слой задан путём, запрет — путём (сверяется по
графу импортов) или именем пакета (сверяется по спецификатору, как он написан).
Графа «исключение» существует, потому что известная дыра и неизвестная — разные
вещи: то, что стоит в ней, разрешено и объяснено, всё остальное — нарушение.

| Слой | Не имеет права импортировать | Исключение |
| --- | --- | --- |
| `client/domain/**` | `react`, `client/config/**`, `client/state/**`, `client/motion/**`, `client/geometry/**`, `client/slides/**`, `client/context/**`, `client/modules/**` | — |
| `client/config/**` | `react-dom`, `client/state/**`, `client/slides/**`, `client/modules/**` | — |
| `client/state/**` | `client/geometry/**`, `client/slides/**`, `client/presentation/**`, `client/modules/**` | — |
| `client/modules/**` | `client/state/**` | `client/state/validateState.ts` |
| `shared/**` | `components/Carousel/**` | — |
| `shared/clientState/sharedStore/**` | `shared/**` | `shared/clientState/sharedStore/**` |
| `shared/engines/kinetic/internal/**` | `shared/engines/motion/**`, `shared/engines/gesture/**` | — |
| `data-gen/**` | `react`, `client/**` | — |

Что каждая строка держит:

- **`domain` ничего не знает о том, что над ним.** На этом стоит вся его
  тестируемость без React и право звать его функции откуда угодно (`04-state.md`,
  § C). `config` в запретах не по ошибке: связь идёт обратно — это `config`
  втягивает `DRAG_RELEASE_EPSILON` из `domain`.
- **`config` не тянет за собой рантайм.** Он собирает объект настроек и не
  должен уметь ничего, кроме этого.
- **`state` не смотрит вниз, в DOM и рендер.** Единственная его зависимость
  вверх — два файла в `motion/timing`, и она описана отдельно.
- **Модули не импортируют состояние.** Исключение ровно одно и намеренное:
  `checks/stateChecks.ts` — адаптер над чистым валидатором, диагностике нужен
  сам валидатор, а не состояние. Второе такое исключение — повод не дописывать
  строку, а спросить.
- **Полки не знают о карусели.** Иначе папку нельзя вынести копированием.
- **Форк не знает об оригинале.** Ссылки на README в шапках — комментарии, не
  импорты; барьер держится именно на отсутствии импорта.
- **Генератор не знает о компоненте.** То же самое проверяет и
  `boundary/tests/boundaries.test.ts` — здесь правило записано словами, там
  закреплено тестом.

**Чего эта таблица не заменяет.** Она ловит направление, а не смысл: импорт,
разрешённый правилами, всё равно может быть архитектурной ошибкой. И она молчит
про связи, которых нет в импортах, — те живут в разделе про DOM и CSS.

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

## Связи через DOM и CSS — граф, которого нет в импортах

`graph.mjs` видит только импорты. Между тем часть слоёв связана **именами в
DOM**: один файл пишет атрибут или переменную, другой читает — и переименование
не роняет ни сборку, ни типы. Радиус такой правки считается только этой
таблицей.

### Атрибуты, которые пишет карусель

| Имя | Кто пишет | Кто читает |
| --- | --- | --- |
| `data-carousel-root` / `-viewport` / `-track` | `Carousel.tsx` | никто в коде — опоры для хоста и e2e |
| `data-breakpoint`, `data-orientation`, `data-<flag>` | `Carousel.tsx` из `useSlideViewport` | `Carousel.module.scss`, стили модулей; имена состояний сверяет `checks/viewportChecks.ts` |
| `data-moving` | `Carousel.tsx` | `Carousel.module.scss` — гасит переход обводки на время поездки |
| `data-touch`, `data-reduced-motion` | `Carousel.tsx` | `Carousel.module.scss` — hover только на не-тач, вуаль без анимации |
| `data-responsive-images` | `Carousel.tsx` | **никто**; см. `00-map.md`, § A |
| `data-active-zone` | `SlideItem.tsx` | `modules/ResponsiveImages` — `querySelectorAll('[data-active-zone="false"] img')` |
| `data-image-status` | `SlideItem.tsx` | никто в коде — крючок для хоста |
| `data-reorienting`, `data-awaiting-image` | `SlideItem.tsx` | `Carousel.module.scss` — вуаль поворота и медленная проявка |
| `data-drag-ignore` | хост | полка жеста (`DRAG_IGNORE_ATTRIBUTE`) |
| `inert` | `SlideItem.tsx` | браузер; на нём же стоит спасение фокуса |

Самая хрупкая строка здесь — `data-active-zone`: её пишет слой слайдов, а
читает **другой модуль**, селектором в строке. Переименование ломает предекодер
молча.

### Переменные CSS: JS → CSS

| Переменная | Объявляет | Читает |
| --- | --- | --- |
| `--visible-slides` | `presentation/cssVars.ts` | `Carousel.module.scss` — формула ширины слота |
| `--slide-reorient-fade-in` / `-out` | `presentation/cssVars.ts` из `config/slides` | `Carousel.module.scss` — длительности вуали |
| `--slide-lane` | `presentation/cssVars.ts` на каждый слайд | `Carousel.module.scss` — сдвиг полосы |
| `--visible-dots-count`, `--dot-size`, `--dots-gap` | `PaginationWidget.tsx` | `PaginationWidget.module.scss` — вся геометрия ленты |
| `--dot-active-strength` | `PaginationWidget.tsx` на точку | `PaginationWidget.module.scss` |

### Переменные CSS: CSS → JS (обратное направление)

Тут стороны меняются местами, и это единственные два места, где **стиль
управляет числом в коде**:

| Переменная | Объявляет | Читает |
| --- | --- | --- |
| `--pagination-dot-opacity`, `-opacity-active`, `-scale-active` | `Pagination.module.scss` | `usePaginationFade.readDotStates` через `getComputedStyle`; фолбэки в коде обязаны их зеркалить (`07-invariants.md`, § L1) |
| `--slides-gap` (с каскадом `--gap` → `gap` → `column-gap`) | `Carousel.module.scss` | `domain/measureSlotSize` — из него берётся ширина слота |

Отсюда правило, которого не видно ни в одном файле по отдельности: **сменить
`--slides-gap` или `--pagination-dot-*` в стилях — это правка кода**, потому что
на другом конце их читает JS.

### Чем это закреплено

Контрактные тесты читают **сами файлы** стилей и разметки, а не поведение:
`layoutCssVarsSync`, `measurementContractSync`, `slideHeightSync`,
`styleLayerContract`, `orientationMediaSync`, `bootSync`. Они и есть проверка
этого графа — всё, что не покрыто ими, расходится молча.

## O. `shared/**` — полки

Полки импортируются откуда угодно и **сами не импортируют клиент**. Внутри
`shared/index.ts` собраны бочки `clientState`, `viewportObservation` и трёх
движков.

**Форк — это граф, которого нет.** `kinetic/internal/{motion,gesture}` не
импортирует ни оригиналы, ни клиент: связь между копиями существует только как
обязательство править их парно (`CLAUDE.md`), и проверяется сверкой, а не
компилятором.

Сверка на этот заход (нормализованы только ссылки на README):

- `motion` ↔ `internal/motion`: расходятся **два файла** —
  `compositedRide.ts` (урезанный намеренно) и `index.ts` (барьер форка шире);
- `gesture` ↔ `internal/gesture`: расходится **один** — `index.ts`;
  плюс в форке нет `releaseKinetics.ts`, его роль берёт фасад.

Всё остальное байт-идентично, включая два самых больших файла проекта
(`usePointerSwipe` 651 и `createMotionController` 297).

Байт-идентичность здесь — **измерение, а не требование**. Требование мягче и
строже одновременно: копии обязаны совпадать по смыслу, поведению и
корректности, а расходиться им можно там, где одиночной библиотеке и фасаду
нужно по-разному. Поэтому сверки содержимого в `verify` нет — она объявляла бы
законное расхождение поломкой. Вместо неё `graph.mjs twins` спрашивает в момент
правки, попал ли близнец в тот же дифф: **баг, починенный в одной копии, —
единственный настоящий риск форка.**

**Две функции, два имени:** `gesture` отдаёт `sameDirectionSpeed`, `motion` —
`alignSpeed`, и это байт-идентичные функции. Сливать их не будем — полки обязаны
быть самодостаточны. Компонент их больше не смешивает: алиас
`alignSpeed as sameDirectionSpeed` в `client/motion/speed.ts` снят, так что имя
на месте вызова говорит, из какого движка пришла функция.

## L. `client/modules/**` — слоты

Модули подключаются хостом и **не импортируют состояние**: логика колоды
приходит к ним только двумя половинами контекста. Отсюда практический вывод:
модуль можно удалить или заменить, не трогая ядро.

**Движение — исключение, и оно намеренное.** Четыре файла пагинации импортируют
`client/motion` напрямую: `basic/{fadeKeyframes,usePaginationFade}.ts` и
`widget/{math/trajectory,usePaginationWidgetBinding}.ts`. Берут они оттуда не
состояние движения, а **математику кривой** (`keyframesAlongStops`,
`positionAtNow`) и типы плана — то самое, ради чего бочка `motion/index.ts`
реэкспортит пять функций полки (`00-map.md`, § E). Позиция всё равно приходит
контекстом; импортируется только способ её посчитать.

| Модуль | Что читает из контекста | Что делает |
| --- | --- | --- |
| `Controls` | `isAtStart`/`isAtEnd`, `handlePrev`/`handleNext` | две зоны навигации |
| `Pagination` (basic) | `intent`, `layout`, `navigation`, оба потока | точки + биндинг вида |
| `PaginationWidget` | то же плюс собственные пропы | лента + биндинг проекции |
| `ResponsiveImages` | `trackRef`, `isOffBandFetchOn`, `status`, `intent` | включает респонсив-стек; тело — предекодер |
| `Diagnostic` | диагностический контекст + `slides` | аудит, только в dev |

**Обратная связь ровно одна:** `PaginationWidget` импортирует
`useWidgetDiagnostic` из `Diagnostic` — то есть модуль зовёт модуль. Это
единственное место, где слоты знают друг о друге.

`modules/index.ts` — **мёртвая бочка**: App берёт каждый модуль глубоким путём
(записано в `01-facts.md`, C).

## K. `client/slides/**`

Слой стоит между `state` и DOM и почти ничего не отдаёт наружу: из бочки
выходят `SlideItem`, три хука и типы стора картинок. Зависимости внутрь:
`domain` (записи, окно, флаги, правило URL), `config` (тайминги вуали, политика
ретрая), `geometry` (`resolveImageSizes` через `Carousel.tsx`).

**Стор картинок — отдельный SSOT со своей границей.** Он не знает ни о React, ни
о карусели: три хука-моста (`useImageResource`, `useImageResourceStore`,
`useImageResourceRetention`) — единственное, что его касается. Заменить его на
другой источник можно, не трогая `SlideItem`.

**Подпись вьюпорта спускается сверху пропом**, а не читается на слайде — это
осознанный отказ от N подписок в окне рендера.

## I. `client/{presentation,context,render-policy,host-report,viewport}/**`

Здесь связь идёт **не импортом, а контекстом**: модули (`client/modules/**`) не
импортируют ни состояние, ни движение — они читают две половины контекста.

```
state + motion + geometry ──> useModuleContextValue ──> CarouselStableContext ──┐
                                                   └──> CarouselMotionContext ──┤
                                                                                v
                                    modules: Controls, Pagination, Diagnostic, ResponsiveImages
```

Следствие для рефактора: **переименование поля в состоянии не задевает модули
напрямую** — задевает вид (`CarouselLayoutView`, `CarouselStatusView`), а вид
обязан оставаться стабильным по идентичности. Ломается всё разом именно на
уровне вида, не на уровне состояния.

`render-policy` — единственные ворота рендера модулей; `host-report` —
единственный канал наружу к хосту; `presentation/cssVars` — единственное
объявление кастомных свойств CSS.

## H. `client/{gesture,navigation,autoplay,focus}/**`

Четыре входа команд. Все четыре кончаются `dispatch`, и ни один не держит
состояния колоды — поэтому связь у них не «кто кого импортирует», а **кто чем
питается**:

| Вход | Чем питается | Куда отдаёт |
| --- | --- | --- |
| жест | полка `usePointerSwipe`, `domain` (разрешение отпускания, перевод скорости), `geometry` (`getSlotSize`, `slotPx`), API трека (`applyTrackPosition`, `cancelTrackMotion`) | `START_DRAG`/`END_DRAG` + прямые записи в трек |
| навигация | только `dispatch` и живая позиция из `geometry` | `MOVE`/`GO_TO` |
| автоплей | `state` (фаза), `config`, полки `useViewportVisibility`/`useViewportBusy`, **navigation** | `MOVE`/`GO_TO` через навигацию |
| фокус | `state` (покой и страница), полка `manageFocusShift` | ничего — только DOM-фокус |

**Автоплей ходит теми же дверьми, что и пользователь** — через `navigation`, а
не напрямую в редьюсер. Отсюда и одинаковое поведение шага, и одинаковая
атрибуция причины движения.

Обратная зависимость одна: `config/resolve/buildConfig` импортирует
`GESTURE_COAST_MAX_MS` из `gesture/coast`.

## G. `client/geometry/**`

Мост в DOM: сюда сходятся обе шины движения и отсюда идёт единственная запись
`transform`. Потребителей мало, но связи несущие:

| Кто | Что берёт |
| --- | --- |
| `Carousel.tsx` | оба хука; передаёт `slotSize` в жест и в модули, `TrackBindingApi` — в исполнение движения |
| `motion/useMotionRunner` | тип `TrackBindingApi` и две функции из него — `startCompositorMotion`, `cancelCompositorMotion` |
| `slides/SlideItem` и модули картинок | `resolveImageSizes` поверх опубликованного `slotPx` |
| `gesture/useCarouselGesture` | `slotPx` для калибровки порогов |

**Направление зависимостей внутри слоя одностороннее:** `useTrackBinding`
подписывается на `useSlotSizeSource`, обратной связи нет. Второго измерителя в
проекте быть не должно — это `CONSTRAINT` в коде.

## E–F. `client/motion/**` и `client/visual-position/**`

`client/motion/**` — 14 импортёров (+4 тестовых), `client/visual-position/**` —
6 (+4). Но связь здесь не «импорт функции», а **две шины**, и это главное
отличие слоя от остальных:

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

`client/state/**` — 12 импортёров (+6 тестовых), и зависимость двух разных
сортов:

| Что берут | Кто |
| --- | --- |
| `dispatch` (нужна **неизменная идентичность**) | `autoplay/useCarouselAutoplay`, `gesture/useCarouselGesture`, `navigation/useCarouselNavigation`, `motion/useCarouselMotionExecution` |
| `state` / `motionStatus` (чтение) | `Carousel.tsx`, `context/*` (значения контекстов модулей), `autoplay/useCarouselAutoplay`, `motion/segmentFactory`, `motion/duration`, `motion/useMotionRunner`, `modules/Diagnostic/checks/stateChecks` |

Наружу (`state/index.ts`) выходит узко: `useCarouselState`, `motionStatus` и
пять типов. Мимо бочки за пределы слоя уходит одно имя —
`validateCarouselState` в `modules/Diagnostic/checks/stateChecks`;
`carouselReducer`, `buildInitialState` и `resolveStepTransition` берут прямым
путём только собственные тесты слоя.

**Зависимость вверх — два файла, а не один.** `transitions.ts` импортирует
`resolveGoToPlan`, `reducer.ts` — `resolveGoToApproachDistance`, оба из
`motion/timing`. Планирование телепорта живёт в motion, а решения о нём — и
о старте, и о развороте на подход — принимаются здесь; при переносе любого из
трёх файлов это первое, что порвётся.

## C. `client/domain/**`

`client/domain/**` — 22 импортёра (+12 тестовых), самый широко потребляемый
слой. Смена сигнатуры здесь задевает больше всего кода, поэтому радиус
проверяется до правки: `node .context/graph.mjs blast`.

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
