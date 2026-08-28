# 00-map — карта кодовой базы

Читается построчно, одна запись на файл. Якоря `file:line` от корня репозитория.
Подозрения помечены `?` — они кандидаты, не приговор.

> **Правило чтения этой карты.** Комментарии и доки в коде часто ссылаются на
> прошлые прогоны разработки и на замеры, сделанные до нас. Такие ссылки здесь
> НЕ воспроизводятся и авторитетом не считаются. Фиксируется только **механика**:
> что код делает и от чего это зависит. Любое утверждение о поведении на
> устройстве, о производительности или о том, «что случится, если убрать», —
> наша собственная гипотеза, подлежащая нашей собственной проверке.

Легенда состояния: **SSOT** — единственный источник истины для чего-то;
**pure** — без побочных эффектов; **fx** — есть эффекты/подписки/DOM.

---

## A. Точка входа и публичный контракт

### `src/components/Carousel/client/index.ts` (13)
Бочка. `default` = Carousel, типы + `SLIDE_CLASS_KEYS` из `public-api`.
Побочных эффектов нет. Заметно: `CLASS_NAME_KEYS` наружу **не** отдан, хотя
`SLIDE_CLASS_KEYS` отдан — асимметрия, проверить потребителей.

### `client/public-api/types.ts` (79) — pure
SSOT публичного контракта. `SLIDE_CLASS_KEYS` (4 ключа) ⊂ `CLASS_NAME_KEYS` (7).
Типы `Slide`/`SlideImageVariants`/`SlideImageSource` **выведены из Zod-схем**
(`z.infer`), т.е. схема — источник, тип — производное.
`CarouselProps` — 21 поле, все опциональные кроме `slidesData`. `ref` как проп
(React 19), не `forwardRef`.
- Инвариант: идентичность слайда = `id` + `content` (заявлено в комментарии
  `:38`), но в типе ничего это не держит.

### `client/public-api/schemas.ts` (39) — pure
Zod-схемы. `ReactElementSchema` (`:7`) проверяет `$$typeof` против двух сигилов
(`react.element` и `react.transitional.element`) — ручная проверка, привязана к
внутреннему протоколу React.
- `?` Схемы **не** подключены к рантайму компонента: `CarouselSlidesDataSchema`
  экспортируется только для хоста (`public-api/index.ts:15-21` объясняет — Zod
  не должен попасть в бандл). Т.е. **входные данные компонента не валидируются**.

### `client/public-api/index.ts` (20) — pure
Бочка типов. Сознательно не реэкспортит схемы (tree-shaking Zod). Обоснование в
комментарии `:15-21` — решение осознанное и корректное.

### `client/Carousel.tsx` (407) — fx (композиционный корень)
Оркестратор: 20 хуков подряд, порядок значим (комментарии фиксируют почему).
Владеет: `viewportRef`, `trackRef`, `planChannelRef`; собирает 3 контекста;
рендерит `virtualSlides.map` + 4 слот-выхода.
Дефолты пропов раздаются **деструктуризацией** (`:63-71`) — только булевы;
числовые/строковые уходят в `useCarouselConfig` (`:97`). Две разные схемы
дефолтов в одном файле.
- `:51` `IS_DEV = import.meta.env.DEV` — гейт dev-only дескрипторов.
- `:81-83` окружение только из пропа `userEnvironment`, самодетекции нет —
  инвариант соблюдён.
- `:204` `const isOffBandFetchOn = Number.isFinite(slideFetchReach) === false;`
  `?` двойное отрицание вместо `=== Infinity`; читается тяжелее, чем есть.
- `:209-212` ленивая инициализация `planChannel` в теле рендера — идемпотентно,
  паттерн допустимый, но это render-phase запись в ref.
- `:414-421` `isFetchOn` считается инлайном на каждый слайд каждого рендера
  (`laneDistanceFromBand`); ключ — `isActive`, а не `isActual`: середина поездки
  держит на экране и те слайды, от которых уезжают.
- `:315-316` `isInstantMode ? null : ...` — при reduced-motion модулям
  подсовывается `null` вместо источников. Контракт «null = не двигаемся».

### `client/areCarouselPropsEqual.ts` (87) — ещё не прочитан

---

## B. Config

### `client/config/index.ts` (58) — pure
Бочка из 8 файлов + типы. Плоский реэкспорт 30+ констант.

### `client/config/types.ts` (123) — pure
Формы настроек. `CarouselSwipeConfig` (`:43-46`) = `Required<PointerSwipeConfig>`
**минус** `minSwipeDistance` и `swipeThresholdRatio`, плюс `commit` —
т.е. карусель сознательно отказывается от двух полей движка и заменяет их своей
`SwipeCommitConfig`. Проверить, что движок эти два поля действительно не требует.
- `:41-42` двойная пустая строка, `:60-61` тоже — косметика.
- `RawConfigInput` (`:132-138`): все поля `unknown`.

### `client/config/defaults.ts` (19) — pure, SSOT дефолтов пропов
14 значений `as const`. Из них булевы используются в `Carousel.tsx`,
числовые/строковые — в `buildConfig`. Разделение по потребителю, не по смыслу.

### `client/config/{gesture,interaction,layout,legacyPaint,motion,slides}.ts`
Плоские константы, каждая с ссылкой на `docs/config/*`. Без логики.
`gesture.ts` (31) — 13 полей свайпа + 4 инерции; `motion.ts` (19) — 15 долей
профилей и геометрия GO_TO; `slides.ts` (13) — тайминги вуали и ретрая картинок;
`interaction.ts` (6), `layout.ts` (3), `legacyPaint.ts` (2) — по 1-4 константы.

### `client/config/viewport.ts` (23) — pure, SSOT осей вьюпорта
3 брейкпоинта + 1 флаг `short-landscape`. `SLIDE_CANONICAL_SOURCE_MEDIA`
вычисляется на модульном уровне через `canonicalMediaQueries(...)` (`:30-31`) —
работа при импорте модуля, не при использовании.

### `client/config/resolve/buildConfig.ts` (104) — pure
Собирает `CarouselRuntimeConfig` из констант + 5 пропов.
- `:36-37` `withDefault = (value: unknown, fallback: T) => typeof value === "undefined" ? fallback : (value as T)`
  `?` **Слепой каст.** Валидации нет: `visibleSlidesNr: -1 | 0 | NaN | "3"`
  проходит насквозь. Дальше `clampedVisibleSlidesCount` = `Math.min(v, length)`,
  т.е. отрицательное/NaN не отсекается. Кандидат в RISK.
- `:99-103` `swipeConfig`/`releaseConfig` копируются поверхностно (spread +
  вложенный spread `commit`) — защита от мутации потребителем, но только на 2 уровня.

### `client/config/resolve/useCarouselConfig.ts` (28) — pure
`useMemo` над `buildCarouselConfig` с 5 зависимостями. Корректно.

---

## C. Domain (чистая логика, без React и DOM)

### `client/domain/index.ts` (42) — бочка
`export *` из `math`/`types` + поимённо из остальных. Смешение двух стилей.

### `client/domain/types.ts` (41) — pure
`CarouselLayout` (7 полей), `CarouselSlideRecord`, `VirtualSlide`,
`RenderWindow`, `SlideAriaProps`, `PageBoundaryState`.
- `VirtualSlide.virtualIndex` (`:30-32`): **ключевой инвариант** — абсолютная
  виртуальная координата, фиксированная на весь mounted-lifetime слайда; на ней
  держится то, что монтирование соседа не двигает слайд.
- `:41` нет финального перевода строки.

### `client/domain/math.ts` (9) — pure
`mod` (истинный модуль, `total<=0 → 0`), `clamp`, `normalizePageIndex`.
Все три защищены от вырожденных входов.

### `client/domain/layout.ts` (112) — pure, SSOT геометрии страниц
`buildCarouselLayout` (`:28`): `canSlide = length > effectiveVisible`;
`pageCount = ceil(length/effectiveVisible)`; `virtualLength` = полное покрытие
страниц только в цикле, иначе `length`.
`alignedVirtualIndex` (`:52`) — приводит страницу на ту же цикличную «полосу»,
что и опорный индекс, через `Math.round(...)`.
`pageContaining` (floor) против `nearestPageIndex` (round) — комментарий `:64-65`
явно фиксирует разницу; это два разных вопроса к одной координате.
`reconciledPageIndex` (`:93`) — пропорциональный перенос страницы при смене
раскладки.
- `buildDataKey` (`:15-23`) `?` строит строку конкатенацией по всей колоде на
  каждый пересчёт раскладки. Для 12 слайдов ничто, для тысяч — O(n) строка и
  мусор в куче. PERF-кандидат, severity зависит от заявленного масштаба.
- `slideContentKey` (`:7-13`) `?` для React-элемента возвращает константу
  `"react-element"` — два разных JSX-слайда неразличимы в `dataKey`. Значит смена
  React-контента **не** триггерит hardReset в `reconcile`. Кандидат в LOGIC.

### `client/domain/slides.ts` (96) — pure
`buildSlideRecords`, `padDeckToFullPage` (доклад колоды до целых страниц
клонами), `resolveRenderedImageSrc` — «одно правило, которое рендерер и стор
ресурсов обязаны разделять» (`:77-78`), это явный контракт.
- `buildKey` (`:8-11`) `?` не-клон ключ = `slide:${id}` без индекса. **Дубликаты
  `id` во входных данных дают одинаковые React-ключи.** Ничем не защищено.
- `resolveLargestImageCandidate` (`:65-75`) `?` `best as { url: string }` (`:74`)
  — каст ради обхода сужения типов TS; сигнатура честная, но реализация
  выглядит как борьба с компилятором.
- `:70` комментарий фиксирует инвариант «строго больше сохраняет первый при
  равенстве» — намеренный порядок приоритета.

### `client/domain/track.ts` (56) — pure, но `measureSlotSize` читает DOM
`trackPixelTransform`/`trackCssTransform` — два способа выразить одно смещение
(px для компоузитора, calc() для CSS-пути).
- `measureSlotSize` (`:40-54`) `?` вызывает `window.getComputedStyle` и читает
  `offsetWidth` — **принудительный layout/style recalc**. Частота вызова решает,
  PERF это или нет; проверить в `useSlotSizeSource`.
- `:47-51` каскад из 4 CSS-переменных (`--slides-gap`→`--gap`→`gap`→`column-gap`)
  `?` три из четырёх — легаси-подстраховка? Кандидат в DEAD/IMPL.

### `client/domain/visibility.ts` (41) — pure
`slideVisibilityFlags` — `isActual` (в полосе сейчас) против `isActive`
(+ то, что было видно на старте сегмента). `laneDistanceFromBand` — расстояние в
полосах наружу от полосы, 0 внутри.
`buildSlideAriaProps` — `aria-label` = `"N of M"`, `aria-current="step"` только
для `isActual`.

### `client/domain/renderWindow.ts` (53) — pure
`buildRenderWindow` с буфером `visibleSlidesCount * multiplier`; в finite —
клампится в `[0, length-1]`, в цикле не клампится вовсе.
`buildSegmentWindow` — минимальное окно без буфера (для проверки «буфер
покрывает сегмент»). `windowContains`, `expandWindow`.

### `client/domain/dragRelease.ts` (52) — pure
`resolveDragRelease` — решает, куда сесть после отпускания пальца.
Три ветки: явное направление (left/right) → соседняя страница; иначе —
`nearestPageIndex` от позиции, либо, при перехвате летящей поездки,
`pressedPageIndex ?? dragOriginPageIndex` (намерение вместо геометрии, `:36-38`).
`isSnap` = «вернулись туда же». `DRAG_RELEASE_EPSILON = 0.001` (`:8`).

---

## D. State

### `client/state/types.ts` (114) — pure, SSOT формы состояния
`CarouselState`: 12 полей — включая **сам контекст** (`layout`, `config`,
`isInstantMode`). `MotionPhase` — 6 значений. 5 публичных команд плюс
`SYNC_CONTEXT`, который карусель себе не выдаёт: им хост фиксирует контекст в
состоянии (ADR-004). Конверта `ReducerEnvelope` больше нет; `dispatch` стабилен
потому, что это диспатч самого `useReducer`.
- `GestureRelease.launchVelocity` (`:20-23`) — отдельная от `uiVelocity`
  скорость, защищённая от терминального микро-удержания. Тонкий инвариант.
- `:44-46` `teleportVirtualIndex`: пока не `null`, `virtualIndex` держится на
  посадке преflight'а, «чтобы дальняя цель не протекла в окно рендера».

### `client/state/initial.ts` (28) — pure
`buildInitialState` + `motionStatus` (4 булевых из фазы).

### `client/state/reducer.ts` (230) — pure
5 кейсов плюс `SYNC_CONTEXT` первым: он и согласует раскладку
(`reconcileStateToLayout`), и кладёт `config`/`isInstantMode` в состояние.
Граница контекста и есть граница согласования — остальные ветки читают всё с
самого состояния (ADR-004, он же поправляет ADR-001).
- `END_DRAG` (`:52`) — если цель уже достигнута (`hasReachedDragTarget`), сразу
  `idle` без поездки.
- `MOVE`/`GO_TO` (`:103`) — ветка `isNoop` (`:129-147`) сохраняет
  `isRepeatedClickAdvance` и **не** сбрасывает фазу, чтобы раннер пересобрал
  активный сегмент. Тонко и намеренно.
- `MOTION_SETTLED` (`:163`) — три исхода: цель сменилась на лету (переякориться,
  движение продолжить), преflight сел (разрезать середину, начать подход),
  обычная посадка (`idle`).
- `:187-189` `Math.sign(teleportVirtualIndex - settledPosition)`; ветка
  `direction === 0` (`:209-219`) названа «вырожденной» и садится в `idle`.

### `client/state/transitions.ts` (162) — pure
`resolveStepTransition` — вся арифметика шага. `stepOrigin` (`:21`) выбирает
опорную страницу: при повторном клике в ту же сторону — от **визуальной**
позиции (floor/ceil по направлению), иначе — от `targetPageIndex`.
`repeatedClickStep` (`:18-19`) = `sign(step) * 2` — повторный клик прыгает на 2
страницы, не на 1.
- Цель страницы считают два чистых хелпера, по одному на команду:
  `resolveMoveTarget` (`:69`) и `resolveGoToTarget` (`:87`); оба возвращают
  `PageTarget` = `{ nextTargetPageIndex, pageDelta }`. Раньше обе ветки писали
  в общие `let`.
- `:86` комментарий: GO_TO идёт по направлению шкалы точек, **не** кратчайшим
  цикличным путём. Осознанный выбор.
- `isSameDirectionRepeat` (`:160`) — только вне `idle`/`dragging`.

### `client/state/reconcile.ts` (47) — pure
`sameLayout` — 4 поля (`:11-15`), комментарий утверждает полноту проверки
(`dataKey` держит остальное). `hardReset` при смене `dataKey` или `isFinite` →
полный `buildInitialState`. Иначе — пропорциональный перенос страницы и
`motionPhase: "step-instant"` (мгновенная досадка).

### `client/state/useCarouselState.ts` (36) — fx (useReducer)
Одно состояние из редьюсера, никакой проекции поверх: контекст фиксируется
`SYNC_CONTEXT` во время рендера, под защитой сверки идентичностей (`layout` и
`config` мемоизированы выше по дереву, поэтому проход один).
- Рефов нет вовсе. Прежнее замечание «запись в рефы в теле рендера, кандидат в
  RISK по concurrent-safety» снято: прерванный рендер теперь не может оставить
  за собой значение выброшенной попытки, потому что значений вне состояния нет.

### `client/state/validateState.ts` (69) — pure, dev-only
3 структурных инварианта состояния. Явно сказано (`:1-2`), что редьюсер его
не спрашивает — это диагностика, не защита.

### `client/state/index.ts` (9) — бочка.

---

## E. Motion

### `client/motion/index.ts` (25) — бочка
Реэкспортит и своё, и **5 символов из `shared`** (`isWaapiSupported`,
`keyframesAlongStops`, `positionAtNow`, `sampleProgressStops`,
`startPinnedAnimation`) — «чтобы у модулей карусели был один корень импорта».
- `?` Проверить, все ли 5 кем-то используются: транзитная бочка легко копит
  мёртвые реэкспорты.

### `client/motion/types.ts` (24) — pure
`CarouselMotionStrategy` (5) и `CarouselMotionIntent` (10) — **две разные оси**
классификации одного движения. `CarouselSegment` = `ProfileSegment<strategy>`
без `"idle"`.

### `client/motion/tolerances.ts` (3), `speed.ts` (7), `sampler.ts` (4)
Три микрофайла. `sampler.ts` — целый файл ради алиаса
`sampleCarouselSegment = sampleProfileSegment`. `?` IMPL/DEAD-кандидат.
`speed.ts` — алиас `sameDirectionSpeed = alignSpeed` + `signedVelocity`.

### `client/motion/duration.ts` (61) — pure
`durationByVirtualSpan` — длительность пропорциональна пройденным страницам.
`resolveStepDuration` — только для «длительностных» шагов; скоростные (жест,
GO_TO, повторный клик) считают своё.
- `:62-63` `case "gesture"` возвращает то же, что `"click"`; `:64-65` `default`
  = `autoplayDuration`. `?` `gesture` и `click` слиты — намеренно или совпало?
  `default` при `moveReason: null` даёт autoplay-длительность, что странно для
  «неизвестного» шага. Кандидат в LOGIC (низкая severity).

### `client/motion/timing.ts` (123) — pure, SSOT геометрии GO_TO
Комментарий `:1-2` заявляет прямо: **один источник и для редьюсера, и для
segmentFactory, чтобы посадки и профиль не разъехались.** Это ключевое
архитектурное решение слоя.
`resolveGoToPlan` (`:51`) — телепорт только если промежуточных страниц ≥ минимума
**и** хотя бы одна из них реально не будет показана (`hasSkippablePage`), иначе
телепорт — бессмысленное моргание.
- `:102` и `:117` `?` два места, где перерасход долей профиля **сознательно не
  ограничивается**: «over-budget — это Diagnostic, а не cap». В `:117-124`
  при `accelShare > 1` крейсерский член становится **отрицательным**, т.е.
  длительность может выйти отрицательной. Защиты нет by design. RISK-кандидат:
  конфиг это разрешает (`GO_TO_*_SHARE` — свободные числа).

### `client/motion/planChannel.ts` (90) — fx (наблюдаемая, вне React)
4 варианта плана (`idle`/`follow`/`instant`/`waapi`), монотонный `planId`.
Дедуп в `publish` (`:89-97`) только для `idle` и одинакового `follow`.
`DistributiveOmit` (`:60-66`) — корректное решение схлопывания юниона.
- `:70` `publish` объявлен **свойством-функцией**, а не методом: его отцепляют
  от объекта и передают дальше (`Carousel.tsx` → `useCarouselMotionExecution`),
  и контракт теперь это разрешает явно.
- `:98` каст `as CarouselMotionPlan` снят как избыточный: тип выводится из
  спреда, честность `DistributiveOmit` проверяет компилятор.
- `?` `listeners.forEach` без защиты от отписки во время нотификации: `Set`
  переживает удаление на итерации, но добавление нового слушателя внутри
  колбэка — нет. Слабое место, вряд ли достижимое.

### `client/motion/segmentFactory.ts` (355) — pure, ядро профилирования
`intentFromState` (`:31`) — приоритетная лестница из 6 условий + 4 по
`moveReason`. Порядок значим и нигде не продублирован.
4 билдера профиля: `buildStepProfile`, `buildRepeatedProfile`,
`buildGestureProfile`, `buildGoToProfile`.
- `buildGestureProfile` (`:140-190`) — пол длительности поездки: если профиль
  быстрее `minRideDurationMs`, пик пересчитывается, **но стартовая скорость
  никогда не снижается** (`Math.max(..., launch.startSpeed)`) — непрерывность
  важнее пола. Тонкий и явный компромисс.
- `buildGoToProfile` (`:194-282`) — три фазы (`single`/`preflight`/`approach`),
  каждая переводит свой локальный бюджет в доли. `:246-273` потолок по времени
  полёта: непрерывная поездка не должна быть медленнее более дальнего прыжка.
- `:215-217`, `:223`, `:229` `?` `absDistance > 0 ? zones.X / absDistance : 0` —
  доля может выйти **> 1** на коротком расстоянии, и это уходит в `buildProfile`
  без клампа. Связано с `timing.ts:117`.

### `client/motion/useMotionRunner.ts` (286) — fx, самый нагруженный хук слоя
`replanInputs` (`:49-64`) — 13 полей в ОДНОМ месте, питают и массив
зависимостей, и ключ дедупа. Механика: два рукописных списка (deps и ключ)
способны разойтись, и тогда re-plan либо теряется, либо дублируется молча.
Ветвление: `!canSlide` → `idle`; `idle`; `dragging` (заморозить компоузитор,
`follow`); `step-instant`; иначе `startResolvedMotion`.
- `:107-110` `?` ключ = `inputs.join(":")`. Дедуп по строке. `null` склеивается
  в пустую строку — `teleportVirtualIndex: null` неотличим от `undefined`, но
  поле всегда `number|null`, так что практически безопасно.
- `:106-110` + `:297-303` `?` **StrictMode:** `lastKeyRef` переживает
  симулируемый unmount, а эффект размонтирования (`:297`) реально отменяет
  контроллер. На повторном монтировании ключ совпадает → ранний выход → сегмент
  не перепрограммируется. Проверить в фазе 3, это dev-режим, но именно его и
  видит разработчик.
- `:249-261` при активном контроллере берётся `captureHandoff`, и ветка
  «жест» (`:265`) **не выполняется** — коастинг применяется только на холодном
  старте. Проверить, достижим ли END_DRAG при активном контроллере.
- `:283-286` осознанный `eslint-disable exhaustive-deps` с объяснением.

---

## F. Visual position (SSOT видимой позиции)

### `client/visual-position/useVisualPosition.ts` (137) — fx
Оборачивает `useMotionController` из `shared` в собственный поток кадров.
`toFrame` добавляет к сэмплу `pageOffset`, `targetPageOffset` и
`runningFrameIndex` (счётчик серии «running», штампуется ровно в одном месте).
`sampleNow` = `controller.captureHandoff().position` — точная позиция кривой без
reflow, комментарий `:92-93` объясняет, почему не `getSnapshot`.
- `:49-50` запись в реф в теле рендера (тот же паттерн, что в `useCarouselState`).
- `:67-75` собственный `Set` слушателей + `lastFrameRef`; не `useSyncExternalStore`.

### `client/visual-position/types.ts` (29), `fallbackPacing.ts` (9), `index.ts` (7)
`isDroppedFallbackFrame` — одно правило пропуска кадров для трека, точек и
виджета: «чистая функция от кадра, поэтому все роняют одни и те же кадры».

---

## G. Geometry (мост в DOM)

### `client/geometry/useSlotSizeSource.ts` (141) — fx, SSOT измерения слота
Один `ResizeObserver` + один `resize` + один `getComputedStyle` на всех
потребителей. Комментарий `:32-37` фиксирует историю: было три копии, две
расходились в ответе (округлённый против сырого).
Два представления: `getSlotSize()` — сырое, без ререндера; `slotPx` — округлённое
с эпсилон-гейтом, ререндерит.
- `:114` `entry?.contentRect.width` вместо чтения layout в колбэке — сознательно.
- `:144-147` результат мемоизирован. Механика (`:138-143`): свежий объект на
  каждый рендер заставляет эффект потребителя переподписываться, а React рвёт
  ВСЕ эффекты коммита до запуска новых — значит нотификация, испущенная изнутри
  коммита, попадает в пустой набор слушателей.

### `client/geometry/useTrackBinding.ts` (277) — fx, самый «грязный» файл
Владеет: `Animation`, транзитом транcформа, ре-базированием.
`writePosition` (`:88`) — не пишет per-frame, пока жив компоузитор (`:95`).
`cancelCompositorMotion` (`:105`) — сначала заморозить на известной трансформе,
потом `cancel()`; без явной позиции платит `getComputedStyle` (`:123`).
`startCompositorMotion` (`:138`) — 6 условий отказа, синхронная отрисовка
стартового кадра (`:168`), `onfinish`/`oncancel` с проверкой идентичности.
`rebaseTrack`/`rebaseForLayoutOrigin` — перепин на новую геометрию.
- `:266` пропуск кадров только при `isFallbackFollowRef`, судят по ПЛАНУ, а не
  по `isWaapiSupported()`; комментарий `:245-249` объясняет, почему это разные
  вопросы. Хорошее решение.
- `:279-285` `?` размонтирование отменяет анимацию, но **не** зовёт
  `visualPosition.wake()`, в отличие от `cancelCompositorMotion`. Осознанно
  (элемент уходит) — но это второй путь отмены с другой семантикой.

### `client/geometry/resolveImageSizes.ts` (17) — pure. Функция, не хук — намеренно.
### `client/geometry/index.ts` (8) — бочка.

---

## H. Gesture / navigation / autoplay / focus

### `client/gesture/useCarouselGesture.ts` (273) — fx
6 рефов состояния драга + отложенный `START_DRAG` через `setTimeout(0)`
(`:129-132`) с ручным `flushPendingStart` у зависимых путей — «гарантия порядка
в редьюсере: START_DRAG всегда до END_DRAG».
- `:232-264` `?` **эффект-уборщик зависит от `layout`** (объект). Если хост
  передаёт `slidesData` инлайн-литералом, `layout` пересоздаётся каждый рендер →
  эффект чистит рефы драга на каждом рендере → драг ломается. Связано с
  `areCarouselPropsEqual` (см. ниже). Сильный RISK-кандидат.
- `:111-117` `getBoundingClientRect()` на прессе — один layout read за жест,
  приемлемо.
- `:177-181` `isScrollHandOff` — различение «намеренное удержание» и «страница
  проскроллилась», через `contextmenu`-флаг. Хрупко по природе, но альтернатив нет.

### `client/gesture/coast.ts` (35) — pure
Экстраполяция позиции через «коммит-разрыв», ограниченная `GESTURE_COAST_MAX_MS`.
`crossed` (`:37`) не даёт перелететь цель.

### `client/gesture/slotAdaptiveSwipe.ts` (44) — pure
Перевод «контент-относительной» настройки в абсолютные px движка.
`SWIPE_REFERENCE_SLOT_PX = 400` назван **записью калибровки, а не ручкой**.
`swipeThresholdRatio: 0` выключает собственный порог движка.
- `:38-43` кривизна масштабируется обратно слоту, флик — прямо. Разное поведение
  объяснено (`:40-41`).

### `client/navigation/useCarouselNavigation.ts` (74) — pure-ish
6 колбэков + `useMemo`. `move`/`goTo` берут `fromVirtualIndex` из
`readCurrentPosition()` — т.е. **из визуальной позиции, не из состояния**.
Это и есть точка, где клик подхватывает летящую поездку.

### `client/autoplay/useCarouselAutoplay.ts` (54) — fx-композитор
Склейка `useViewportVisibility` + `useViewportBusy` + `useAutoplay`.
`isPaused = !visible || isDragging || isMoving`.

### `client/autoplay/useAutoplay.ts` (94) — fx
Таймер + пауза по ховеру с задержкой.
- `:82-83` `?` при `shouldDeferTick()` вызывается `arm()` заново — то есть
  откладывание стоит **полный `intervalMs`**, а не короткий resettle-интервал.
  Кандидат в LOGIC: `AUTOPLAY_RESETTLE_DELAY_MS` управляет «тишиной» внутри
  `useViewportBusy`, но цена промаха — целый интервал.
- `:93-101` массив зависимостей включает `isAtEnd`, `onStep`, `onGoToStart`,
  `shouldDeferTick`: любая смена идентичности **перезапускает таймер с нуля**.
  Проверить стабильность `getIsViewportBusy` в `shared`.
- `:35-39` пауза по ховеру гасится **в рендере**, а не `setState` из эффекта:
  когда ховер перестаёт наблюдаться (`enabled` снят или `ignoreHover`), флаг
  снимается в том же проходе, эффект рядом только чистит таймер.

### `client/focus/useFocusRecovery.ts` (28) — fx
Возврат фокуса после посадки; триггер — переход в `isIdle` **или** смена
страницы при уже идущем `isIdle`.

---

## I. Presentation / context / policy / report

### `client/presentation/useCarouselPresentation.ts` (90) — fx (кэш в рефе)
`laneCacheRef` — кэш стилей полосы, чтобы проп `style` у `SlideItem` оставался
`===` между двумя перестроениями `virtualSlides` за поездку. Ключ кэша —
`origin:virtualIndex`, поэтому смена `layoutOrigin` не требует синхронного
сброса: старые записи просто перестают попадаться.
- Чтение и запись — из `useCallback`, чистка — из эффекта после коммита.
  Прежнее замечание «кэш чистится внутри `useMemo`, скрытая мутация в
  мемоизации» снято: мутации в мемо больше нет.

### `client/presentation/cssVars.ts` (30) — pure, SSOT контракта JS→CSS
3 корневые переменные + 1 на слайд.
### `client/presentation/domPayload.ts` (19) — pure
`buildSlideClassMap` подставляет `""` вместо `undefined` (иначе React снимет
атрибут). `buildFlagAttributes` — `data-<flag>="true"` только для активных.

### `client/context/useModuleContextValue.ts` (129) — pure (мемо-каскад)
**Разделение контекста на два**: `stable` (низкочастотный) и `motion`
(переидентифицируется на каждом переходе). 6 вложенных `useMemo`.
### `client/context/types.ts` (96) — pure. Три вью-контракта + диагностический.
### `client/context/useDiagnosticContextValue.ts` (143) — pure
Все 4 подвью гейтятся `IS_DEV`; в проде — `SILENT_SUBVIEW = null as never`
(`:19`) и замороженный `SILENT_VALUE`.
- `?` `as unknown as CarouselDiagnosticContextValue` (`:16`) и `null as never`
  (`:19`) — **тип лжёт** в проде: потребитель, обратившийся к `.state` в
  production, получит `null` вместо заявленного `CarouselState`. Защита —
  только соглашение «Diagnostic не рендерится в проде». Кандидат в RISK/ARCH.
### `client/context/CarouselModuleContext.ts` (24), `CarouselDiagnosticContext.ts` (12)
`createContext(null)` + хук, бросающий при отсутствии провайдера. Корректно.
`CarouselDiagnosticContext.ts:14` — нет финального перевода строки.

### `client/render-policy/useModuleRenderPolicy.ts` (76) — pure
Гейт слотов: `controls`/`pagination` требуют ещё и `canSlide`;
`diagnostic` — только `IS_DEV`.
### `client/host-report/useCarouselStatusReporter.ts` (44) + `statusSnapshot.ts` (12)
Дедуп по мелкому сравнению 5 полей перед вызовом хостового колбэка.

### `client/viewport/useSlideViewport.ts` (5) — одна строка поверх `useMedia`.
### `client/slots/slotNames.ts` (14) — SSOT имён слотов + тип-брендирование
`CarouselSlotComponent<C, Name> = C & { slot: Name }`.

---

## J. Мемо-компаратор

### `client/areCarouselPropsEqual.ts` (87) — pure
Все пропы сравниваются по `Object.is`, **кроме `children`** — те структурно
(тип + key + мелкое сравнение пропов, глубина ≤ 4, `:16`).
Комментарий `:1-4` объясняет причину: инлайновые JSX-дети — свежие объекты на
каждый рендер хоста.
- `?` **Ключевое следствие, нигде не выраженное в типах:** стабильность
  компонента держится на том, что хост мемоизирует `slidesData`, `className`,
  `userEnvironment`, `onSlideClick`, `onCarouselStatusChange`. Инлайновый
  `slidesData={[...]}` пробивает мемо → пересборка `records`/`layout` → см.
  эффект в `useCarouselGesture:232`. Сильный ARCH/RISK-кандидат.
- `:53` глубже `MAX_CHILD_COMPARE_DEPTH` возвращается «изменилось» — fail-safe,
  явно так задумано (`:9-15`).

---

## K. Slides

### `client/slides/useCarouselSlideDeck.ts` (62) — pure (4 × `useMemo`)
Цепочка `rawRecords → records (padding) → layout`. Идентичность `layout`
целиком определяется идентичностью пропа `slidesData`.

### `client/slides/useSlideRenderModel.ts` (154) — fx (2 рефа-кэша)
Окно рендера **не сжимается во время движения** — слайд не размонтируется на
лету. Хранится в состоянии (`useState` + правка во время рендера), а не в ref
из `useMemo`: memo React вправе выбросить, а это значение обязано пережить
такое. Побочная выгода — идентичность окна меняется только при смене границ.
`layoutOrigin` пересчитывается только при дрейфе за `LAYOUT_ORIGIN_BAND_SLOTS = 512`
(`:34`) — «редкая атомарная ре-базировка, чтобы сдвиг окна не ре-растеризовал слайды».
`slideCacheRef` (`:91`) — кэш объектов `VirtualSlide` по виртуальному индексу;
комментарий `:82-90` подробно объясняет цену без него.
- `:152-154` подчистка кэша итерацией по `cache.keys()` с `delete` внутри —
  для `Map` безопасно.
- `?` `Array.from({length}, ...)` на каждый пересчёт: длина = размер окна
  (band × (1 + 2·multiplier)), при `visibleSlides=3, mult=4` это 27 объектов —
  дёшево; но растёт линейно с `renderWindowBufferMultiplier`.

### `client/slides/useSlideFetchReach.ts` (97) — fx
Двухволновая загрузка: полоса → (после «полоса отчиталась» И «колода стоит») →
весь буфер. Реач **никогда не сжимается** (`isBufferOpen` — защёлка).
Гейт открывается по «отчитался хоть раз» (успех ИЛИ ошибка), а не по «загрузился»:
иначе ретрай (`loading → error → loading`) открывал бы и закрывал его циклически.
- «Ждать нечего» (нет стора или нет URL) вычисляется в рендере, а защёлка
  `isBufferOpen` взводится правкой состояния во время рендера — обе ветки
  раньше шли через `setState` из эффекта и стоили лишний коммит.
- Стабильная ссылка на список URL полосы (`virtualSlides` — свежий массив на
  каждый диспатч) держится в состоянии и сверяется чистым `sameUrls`; раньше
  прошлое значение лежало в ref, который писали внутри `useMemo`.
- `:56` `!next.includes(url)` — O(n²), но n = ширина полосы. Не проблема.
- `:74-95` подписка на каждый URL полосы, `evaluate` пробегает все.

### `client/slides/useOrientationSwapVeil.ts` (70) — fx
Вуаль на смену ориентации, чтобы скрыть перерисовку устаревшего кропа.
Три пути снятия: `decode()`, `complete`, слушатели `load`/`error`; плюс
fail-open по `veilMaxMs`.
- `:66-75` в teardown вуаль снимается принудительно — комментарий объясняет,
  что иначе слайд останется замаскированным навсегда.

### `client/slides/SlideItem.tsx` (134) — fx, `memo`
Ветвление рендера: ошибка → alt-текст; `!isFetchOn` → **ничего не монтируем**
(комментарий `:118-122` объясняет, почему не `<img>` без `src`); `sources` →
`<picture>`; иначе — `<img>`.
- `:56` `if (!slideData) return null;` — ранний выход **после** 3 хуков; тип
  `slideData: Slide | null | undefined` (`SlideItem.types.ts:8`) допускает
  пустоту, хотя вызывающий её никогда не передаёт. `?` мёртвая ветка + лишняя
  опциональность в типе.
- `:74` `key={sources.length === 0 ? generation : undefined}` — ключ ретрая
  либо на `<img>`, либо на `<picture>` (`:124`). Двойное правило.
- `:61` `Tag = isClickable ? "button" : "div"` — смена тега перемонтирует узел.
- `:103` `inert={!isActive ? true : undefined}`.

### `client/slides/imageResource/createImageResourceStore.ts` (130) — fx, вне React
Store на `Map` + `Map<string, Set<listener>>`. Замороженные снапшоты,
`generation` бампится только ретраем. Экспоненциальный бэкофф с потолком и
`maxAttempts`. `prune(allowed)` и мягкий `dispose()`.
- `:69-70` дедуп коммита по паре (status, generation) — корректно.
- `:120` `2 ** (failureCount - 1)`: первый ретрай при `failureCount = 1` даёт
  `2**0 = 1` × base. Корректно.
### `client/slides/imageResource/useImageResource.ts` (65) — `useSyncExternalStore`
Корректный мост; `getSnapshot` служит и серверным снапшотом.
### `useImageResourceRetention.ts` (41), `useImageResourceStore.ts` (26),
### `useImageResourceStoreInstance.ts` (27), `types.ts` (23), `index.ts` (9)
Жизненный цикл стора: ленивое создание **в теле рендера** (`Instance:14-16`),
мягкий dispose при выключении и на размонтировании.

---

## L. Modules (слоты)

### `modules/index.ts` (9) — бочка
Экспортит `Controls`, `Pagination`, `PaginationWidget`, `Diagnostic`.
- `?` **`ResponsiveImages` не экспортирован**, хотя это полноправный слот-модуль
  (`slots/slotNames.ts` знает `"responsive-images"`). `App.tsx:19` импортирует
  его глубоким путём в обход бочки. Кандидат в ARCH (дыра в публичной поверхности).

### `modules/Controls/*` (30+30+11+2 + 139 scss)
`Controls` рендерит 0-2 `NavigationZone` по `isAtStart`/`isAtEnd`.
`NavigationZone` — `<button>` с `aria-label`, внутри `aria-hidden` div + иконка.
SCSS: зона = 8% ширины на десктопе, на touch зона **становится** кнопкой.
- `Controls.module.scss:10-18` — блок «нейтрализации дефолтов контролов»,
  повторённый **дословно** в трёх стилях (`Carousel.module.scss:87-95`,
  `Pagination.module.scss:36-44`). Комментарий прямо говорит, что это
  осознанное дублирование ради самодостаточности файла.

### `modules/Pagination/index.ts` (9)
Две реализации одного слота, комментарий требует подключать ровно одну.
Ничем не проверяется: `resolveSlots` при двух детях с тем же слотом просто
предупредит в dev и возьмёт последний.

### `modules/Pagination/basic/usePaginationFade.ts` (561) — fx, второй по сложности
Движковая привязка точек. Одно «путешествующее смещение» владеет всей лентой;
каждый режим (WAAPI-шаг, follow, покой) пишет ОДНУ И ТУ ЖЕ функцию от смещения.
Владение точкой (`takeDotOwnership`) гасит CSS-transition на время анимации —
комментарий `:156-159` называет это load-bearing: два эффекта на одном свойстве
роняют анимацию Blink на главный поток.
- `:42-43` `FALLBACK_INACTIVE/ACTIVE` ОБЯЗАНЫ зеркалить SCSS. **Сверено:**
  `Pagination.module.scss:13-15` = `0.2 / 0.8 / 1.5` — совпадает.
- `:333-412` ветка `plan.isJump` — прямой кросс-фейд вместо развёртки; строит
  `blends` от состояния предыдущей анимации, а не от DOM.
- `:349` `previousProgress!` — non-null assertion, обоснованная веткой выше.
- `:394` `[...animationsRef.current.values()].includes(owner)` — линейный поиск
  в `onfinish`; на 5-10 точках ничто.
- `:534-543` подписка на план в layout-эффекте, teardown снимает всё.

### `modules/Pagination/basic/fadeKeyframes.ts` (129) — pure
Вид точки как функция расстояния до смещения. `offsetDistance` в цикле
сворачивает расстояние (шаг с 0-й страницы — один, а не `pageCount-1`).
`reachedDotIndexes` — только те точки, что вообще могут что-то показать.

### `modules/Pagination/basic/{Pagination,PaginationDot,types,index}` (47/52/13/2)
`PaginationDot` — `<button>` при интерактивности, иначе `<div>`;
`aria-hidden` на обёртке (индикация для AT идёт через `aria-current` на полосе).
- `PaginationDot:44-57` смена тега `div`↔`button` перемонтирует узел и **теряет
  инлайн-стили, записанные привязкой**. Достижимо при смене
  `isPaginationInteractiveOn` на лету. `?` RISK.

### `modules/Pagination/widget/usePaginationWidgetBinding.ts` (562) — fx, самый большой
Собственная модель шага виджета: `offsetRef` (логическая позиция ленты),
`stepRef` (активный WAAPI-шаг), `interruptedStepRef` (шаг, снесённый захватом).
Пулы элементов: `dotCount = side*2+1+4`, `ACTIVE_DOT_COUNT = 4`. Эпсилон-гейты
на запись (`0.25px`, `0.002`, `0.01`) — «в покое ноль записей за rAF».
- `:65` `?` **мохибейка в комментарии**: `a dot travels в‰¤ a strip width` —
  испорченный `≤`. Остаток перекодировки.
- `:21-25` и `:77-80` `?` объявления констант **внутри блока импортов** и
  двойные пустые строки. То же в `PaginationWidget.tsx:17-33`. Стиль.
- `:347` `if (plan.isContinuation && stepRef.current) return;` против
  `usePaginationFade.ts:317` `if (plan.isContinuation) return;` — **два разных
  правила для одного флага у двух потребителей одного плана**. Кандидат в LOGIC.
- `:453` владелец сеттла — `animations[0]`, т.е. первая ВИДИМАЯ точка; все
  анимации делят duration/startedAt, так что корректно, но неявно.

### `modules/Pagination/widget/math/projection.ts` (84) — pure
`writeDotProjection` пишет в переданный объект (без аллокаций на кадр).
Края уходят по экспоненте (`EDGE_DOT_DRIFT_FACTOR`), непрозрачность — плато,
затем покойное значение, затем передача на полном шаге.

### `modules/Pagination/widget/math/spatialField.ts` (53) — pure
- `:14` `?` `distance > centerIndex + 0.5 ? 0 : ...` — при
  `centerIndex = floor(visibleCount/2)` максимум `distance` = `centerIndex`
  (нечётный) или `centerIndex` (чётный), т.е. условие **никогда не истинно**.
  Кандидат в DEAD.
- `:53-54` нет финального перевода строки.

### `modules/Pagination/widget/math/trajectory.ts` (85) — pure, но
- `:18-25` `?` **модульный мутируемый `scratch`**, общий для всех вызовов
  сэмплирования. Колбэк возвращает новый объект на каждый стоп, так что утечки
  состояния нет; но это глобальное изменяемое состояние в «чистом» модуле.

### `modules/Pagination/widget/stepTarget.ts` (54) — pure
`WIDGET_STEP_LOOKAHEAD = 2` — совпадает с `REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES`
колоды; комментарий `:9-20` фиксирует связь с покрытием элементов.

### `modules/Pagination/widget/{PaginationWidget,Dot,types,defaults,index}`
`PaginationWidget` при reduced-motion рисует статический снимок (`staticDots`),
иначе отдаёт всё привязке.
- `PaginationWidget.tsx:101` `Math.floor(slotCount/2)` против привязки
  `side + DOT_COVERAGE_MARGIN_SLOTS/2` — арифметически равны, но выражены
  по-разному. `?` IMPL.

### `modules/ResponsiveImages/ResponsiveImages.tsx` (96) — fx, headless
Присутствие слота включает весь адаптивный стек; тело — менеджер предекода
в idle. Очередь + `requestIdleCallback`, отменяемая, с прунингом по живому буферу.
- `:36-40` `track.querySelectorAll('[data-active-zone="false"] img')` — модуль
  читает **DOM карусели** через `trackRef`. Единственное место, где модуль
  ходит в чужой DOM; это осознано (контракт `data-active-zone`).

### `modules/Diagnostic/` — dev-only слой (1560 строк)
`Diagnostic.tsx` (98) — 6 групп проверок, каждая под `IS_DEV`, плюс скан
таблиц стилей после mount. Рендерит `null`.
`checks/constantChecks.ts` (851) — аудит **каждой** рукописной константы:
~50 числовых правил + 8 реляционных (сумма долей, потолок ретрая, вуаль,
пол поездки, бюджеты рамп GO_TO, зона перехода телепорта).
- `:18,20,32` `?` пустые строки внутри списка импортов.
- `:411` `predicate: (value) => atLeast(0)(value) && value < 400` — работает
  только потому, что `atLeast` — type-guard (`shared/math/numeric.ts:20`).
- `:648-664` при текущих значениях `slotShare*400 = 120 = maxPx` — ровно на
  границе; проверка не срабатывает, но запас нулевой.
`checks/viewportChecks.ts` (231) — сверка осей вьюпорта, парсимости
canonical-медиа, живых `<source media>` слайдов и **имён состояний в CSS**
(обход `document.styleSheets` в обе стороны). Самая амбициозная проверка.
`checks/layoutChecks.ts` (128), `propChecks.ts` (129), `stateChecks.ts` (24),
`widgetChecks.ts` (70), `formatter.ts` (56), `useGroupedWarnings.ts` (23),
`useWidgetDiagnostic.ts` (24), `types.ts` (23).
- `layoutChecks.ts:86-91` — явный отказ ругаться на пустую колоду, с
  объяснением «иначе читатель приучается игнорировать канал».
- `useWidgetDiagnostic.ts:20-28` поля входа деструктурируются до `useMemo`, и
  колбэк собирает объект из них же: список зависимостей больше не расходится с
  тем, что реально читает колбэк (эти четыре поля — весь тип входа).

---

## M. Стили

`Carousel.module.scss` (197) в `@layer baseStyles`; модули — в `@layer components`;
`globals.scss:1` объявляет порядок `reset, baseStyles, components`.
Геометрия по тирам — через `data-breakpoint` / `data-orientation` /
`data-short-landscape` на корне, **не** через media-запросы (кроме одного
приватного порога виджета `PaginationWidget.module.scss:89-103`, что явно
оговорено).
- `Carousel.module.scss:55-56` «MEASUREMENT CONTRACT: NO border/padding on track
  or viewport» — инвариант, который держит математику движения; в коде его
  проверяет `tests/measurementContractSync.test.ts`.
- `Carousel.module.scss:166-168` `[data-moving="true"] .slide { transition: none }`
  — гашение не-компоузитного `outline-color` на время поездки.

---

## N. App / входная точка

### `src/main.tsx` (16) — `StrictMode` + `ThemeProvider` + `App`.
### `src/app/App.tsx` (202) — демо-стенд
- `:35-40` чтение `?slides=` **на модульном уровне** (`window.location`) —
  SSR-враждебно; для стенда приемлемо.
- `:60-69` `openSlide` открывает `content` как URL и отсекает React-элемент:
  публичная схема допускает его третьим вариантом, и `String()` открыл бы
  «[object Object]».
- `:113` `slidesData` живёт в `useState` → ссылка стабильна. **Это и есть то,
  что спасает мемо-контракт** (`areCarouselPropsEqual`); нигде не выражено как
  требование к хосту.
- `:93-96` `paginationOverride` — производная форма, не `useState(isTouch)`:
  состояние защёлкнуло бы первое значение сигнала и не пересинхронизировалось.
- `:112` `// validation is intentionally not part of this flow` — данные из сети
  идут в компонент как есть.
### `src/globals.scss` (108), `src/app/App.module.scss` (104)
Токены темы, `@layer reset`. В `App.module.scss` — сырые media-запросы
(это хост, у него свои оси).
### `index.html` (52) — pre-paint boot-скрипт темы, зеркалящий
`THEME_STORAGE_KEY` и цвета (сверяется тестом `bootSync.test.ts`).
### `vite.config.ts` (10), `vitest.config.ts` (29)
- `vitest.config.ts:26` `?` `exclude: ["src/components/Carousel/**/*.tsx"]` —
  **все TSX-компоненты исключены из покрытия**. Значит `Carousel.tsx`,
  `SlideItem.tsx`, все модули не измеряются. Кандидат в находку по
  тестируемости.

---

## O. Shared — «полки»

Правило репозитория (`CLAUDE.md`): физическое дублирование между полками —
осознанный выбор, не нарушение DRY. Ниже фиксируется факт и его цена, без
предложения «объединить».

### `shared/index.ts` (12)
`export *` из `clientState`, `viewportObservation`, `engines/{motion,kinetic,gesture}`.
**Проверено на коллизии:** `kinetic/index.ts` отдаёт всего 5 имён
(`useKineticValue`, `KINETIC_DEFAULTS` + 3 типа), внутренние форки наружу не
выходят; `motion` и `gesture` не пересекаются по именам. Неоднозначных
star-экспортов нет — бочки собраны аккуратно.
- `?` Но `gesture` отдаёт `sameDirectionSpeed`, а `motion` — `alignSpeed`:
  **две байт-идентичные функции под разными именами**
  (`gesture/inertia/speed.ts:3` vs `motion/profile/profileSegment.ts:47`).
  Сверх того `client/motion/speed.ts:4` реэкспортит `alignSpeed as
  sameDirectionSpeed` — то есть в коде живут ДВА разных импорта одного имени.
  Кандидат в IMPL (читаемость), не в DRY.

### `shared/math/numeric.ts` (34) — pure
10 гардов, все `(value: unknown) => value is number`, все подразумевают
конечность. Это и есть фундамент диагностики.

### `shared/engines/motion/` (12 файлов, 1111)
- `runtime/createMotionController.ts` (254) — SSOT позиции. Ключевое:
  `captureHandoff` (позиция+скорость из ОДНОГО сэмпла, без emit),
  `isPassive` (сегмент без кадрового цикла — компоузитор красит сам),
  `wake` (вернуть цикл, если владелец краски исчез), мягкий `destroy`.
  `scheduleSettle` (`:148-155`) садится по `endTime`, не по срабатыванию таймера.
- `profile/profile.ts` (183) — зоны разгон/круиз/торможение, `smoothstep` и его
  интеграл. `:79-82` доли берутся КАК ЕСТЬ, перерасход → отрицательный круиз,
  зона просто пропускается (`pushZone` при `share <= 0`).
- `profile/progressCurve.ts` (157) — плотность стопов выводится из кривой
  (шаг относительной скорости ~5%), `resolvePeakSpeedForDuration` — корень
  квадратного уравнения, `positionAtNow`, `keyframesAlongStops`,
  кэшированный `isWaapiSupported`.
- `compositor/pinnedAnimation.ts` (27) — `fill: "both"` + пин `startTime`,
  два `try/catch` на капризные движки.
- `compositor/compositedRide.ts` (268) — «под ключ» путь для ОДНОГО элемента.
  Райдер живёт в состоянии (`useState`), а не в ref из рендера: он владеет живой
  ручкой анимации, и memo/ref, который React вправе выбросить, для этого не
  годится. Смена контроллера заменяет райдера правкой состояния во время
  рендера. То же в форке `kinetic/internal/motion`.
- `runtime/{useMotionController,useMotionPaint,clock,types}.ts` — контроллер
  создаётся инициализатором `useState` (был ленивый реф), paint по-прежнему
  ref-обёрнут, но зеркало пишется в эффекте, а не в рендере; один клок
  (`performance.now`).

### `shared/engines/gesture/` (11 файлов, 1058)
- `swipe/usePointerSwipe.ts` (587) — распознавание. Фазы
  `idle→press→dragging→cooldown`, catch-окно 250 мс, EMA по трём скоростям
  (`uiVelocity`, `flickVelocity`, `launchVelocity`), пауза-декей на отрыве,
  подавление клика в cooldown, `touch-action: pan-y`.
  - `:422` `?` **`event.pointerType !== "touch"` → выход.** Движок принимает
    ТОЛЬКО касания: мышью перетащить нельзя вообще. Ни типы, ни имя
    (`usePointerSwipe`) этого не сообщают. Сильный кандидат в LOGIC/ARCH —
    проверить намерение по `gesture/README.md`.
- `swipe/internals/resolveSwipeDirection.ts` (66) — коммит по флику ИЛИ по
  дистанции. Механика `:43-50`: каждый путь читает СВОЮ величину для
  направления (флик — знак скорости, дистанция — знак смещения); расходятся они
  на позднем развороте, и чтение смещения там дало бы направление, противоречащее
  возвращаемой скорости.
- `swipe/internals/math.ts` (61), `interactiveTarget.ts` (42) — чистые.
- `inertia/{inertialRelease,releaseLaunch,releaseKinetics,speed}.ts` —
  намерение флика + «пусковая непрерывность» (старт с видимой скорости отрыва).

### `shared/engines/kinetic/` (26 файлов, 2163)
Фасад `useKineticValue` (168) поверх ВНУТРЕННИХ форков gesture+motion
(`internal/`), самодостаточен по копированию.
- `?` `useCompositedRide(controller)` вызван без `defaults`, поэтому его
  собственный `useMotionPaint` (`compositedRide.ts:273`) — **инертная подписка**;
  краску делает отдельный `useMotionPaint` в `useKineticValue:45`. Кандидат
  в IMPL/DEAD (низкая severity).
- `internal/*` — 20 файлов, копии `motion`/`gesture`. Барьер держится: наружу
  через `kinetic/index.ts` они не выходят.

### `shared/clientState/`
- `shared/useMediaQuery.ts` (67) — ОДИН стор на запрос, count-gated
  подписка, «dormant → следующий потребитель перечитывает живое».
  Комментарий барреля: «keep exactly one copy per project» — то есть
  из всех полок именно эта НЕ дублируется.
- `media/useMedia/useMedia.ts` (56) — фасад осей. `?` вызывает `useMediaQuery`
  **в `.map()`** (`:33-36`) с `eslint-disable rules-of-hooks`; контракт —
  «axes обязан быть статической модульной константой». Ничем не проверяется.
- `media/library/*` (5 файлов) — форк тех же примитивов (`useBreakpoint`,
  `useOrientation`, `useShortLandscape`); использует ТОТ ЖЕ `useMediaQuery`,
  так что стор общий.
- `environment/useUserEnvironment/*` и `environment/library/*` — `?` **форки с
  СОБСТВЕННЫМИ модульными синглтонами**: `useIsTouchDevice` и `useDataSaver`
  существуют в двух байт-идентичных копиях, каждая со своим `listeners`,
  `MediaQueryList` и слушателем `pointerdown`. Наружу из `shared` идёт копия из
  `library`, внутрь `useUserEnvironment` — своя. Потребитель, взявший обе,
  получит два независимых стора и два глобальных слушателя. Это цена изоляции,
  а не дефект DRY — фиксирую как факт.

### `shared/theme/` (13 файлов, 204)
`ThemeProvider` = `ThemeStateProvider` + `BrowserChromeSync`. Хранилище в
try/catch, синхронизация между вкладками через `storage`, `data-theme` на
`<html>` в layout-эффекте. Цвета и ключ дублированы в `index.html` осознанно,
дрейф ловится тестом.

### `shared/viewportObservation/` (5 файлов, 111)
`useViewportVisibility` (IntersectionObserver + `visibilitychange`),
`useViewportBusy` (**не-реактивный геттер** — намеренно, чтобы не ререндерить
на касание). `useIsomorphicLayoutEffect.ts` — «спящая локальная копия для
выноса; репозиторий импортирует общую. НЕ УДАЛЯТЬ».

### `shared/{focus,slots,styles,icons,hooks}` — по 1-2 файла, чистые.
`resolveSlots` (33) предупреждает в dev о неизвестном и о дублирующем слоте,
берёт последний.

---

## P. data-gen (Node-only кит)

6 файлов, 381 строка. Полностью изолирован: `node:*` + собственные типы,
**ни одного импорта из компонента** (проверяется тестом `boundaries.test.ts`).
`buildSlide` (75) — конвенции одного слайда; `generateSlides` (90) —
идемпотентное слияние с прошлым документом (сохраняет `id` и рукописный `alt`
по стабильному слагу); `runDataGen` (131) — единственный файл, трогающий диск;
`cli.ts` (30) — точка входа.
- Контракт «`GeneratedSlide` присваиваем в `Slide`» проверяется компиляцией
  в `boundary/tests/slide-contract.test.ts`.

---

## Q. Тесты (112 файлов / 14 105 строк)

Прочитаны полностью. Общая характеристика: это **не покрытие ради покрытия**.
Почти каждый файл начинается с блока «что именно этот тест удерживает» —
формулировка инварианта, а не списка вызовов. Несколько файлов явно фиксируют,
какие проверки были УДАЛЕНЫ и почему (`math.test.ts:5-9`,
`layoutCssVarsSync.test.ts:43-53`, `fadeKeyframes.test.ts:19-23`,
`useFocusRecovery.test.tsx:107-111` — «тест, который не может упасть, удалён»).

⚠️ Часть этих блоков ссылается на прошлые прогоны и замеры. Как источник
**инварианта** они полезны (что именно нельзя сломать), как источник
**обоснования** — нет: обоснование мы устанавливаем заново.

### Контрактные тесты по файлам на диске (не по коду)
`layoutCssVarsSync` (47), `measurementContractSync` (105), `slideHeightSync` (59),
`styleLayerContract` (89), `orientationMediaSync` (71), `bootSync` (30),
`boundaries` (72), `shippedConstants` (77).
Читают **реальные `.scss`, `index.html`, `*.json`-конфиги** и сверяют их с
константами кода. `measurementContractSync` парсит SCSS собственным
брейс-матчером, чтобы доказать: ни трек, ни вьюпорт не носят padding/border —
инвариант, без которого движение переезжает цель на пару пикселей.
`styleLayerContract` вообще собирает живой `<style>` в jsdom и доказывает, что
неслоёный класс хоста побеждает слоёное правило компонента.

### Интеграционный
`carouselContract.test.tsx` (288) — единственный, кто монтирует реальный
`<Carousel>` и проверяет проводку 20 хуков между собой. Комментарий `:22-26`
честно говорит, что именно этого не видел никто из остальных.

### Крупнейшие
`reducer.test.ts` (556), `segmentFactory.test.ts` (436),
`usePaginationFade.test.tsx` (395), `useMotionRunner.test.tsx` (304),
`trackBinding.test.tsx` (353), `createMotionController.test.ts` (345 в
`kinetic/internal/motion`, 337 в `engines/motion`).

### Тесты-форки — проверено механическим диффом
- 13 файлов в `engines/kinetic/internal/**/tests/` — **байт-в-байт копии**
  оригиналов из `engines/{motion,gesture}/tests/`, отличаются ровно на
  9-строчный заголовок «FORK of …, byte-identical apart from this note».
  Единственное исключение — `compositedRide.test.ts` (141 против 189 строк):
  форк осознанно урезан вслед за урезанной реализацией.
- `environment/library/tests/*` против `useUserEnvironment/tests/*` — отличие
  в 6 строк: заголовок + путь импорта. Комментарий прямо фиксирует причину:
  «две копии держат РАЗДЕЛЬНОЕ модульное состояние — гарантия на одной ничего
  не говорит о другой».
- `media/useMedia/internal/tests/resolveActiveBreakpoint.test.ts:8-18` —
  лучшая формулировка проблемы форков в репозитории: *«пока этого файла не
  было, резолвер выглядел покрытым и не был: тестировалась копия из `library/`,
  которую фасад не импортирует»*.

### Дифф самих форков реализации (не тестов)
19 из 20 пар в `kinetic/internal/` отличаются **только переписанными путями
в doc-ссылках** (`../README.md` → `shared/gesture/README.md`). Логика не
разъехалась. Единственное реальное расхождение —
`compositedRide.ts`: 126 строк в форке против 254 в оригинале, форк
сознательно выбросил `flyTo`, `dragBinding`, `position`, `DEFAULT_RIDE_SHARES`,
rider-defaults и собственный `useMotionPaint`. Помечено комментарием
`(Fork trims flyTo/dragBinding.)`.

### Что тестами НЕ покрыто
- `vitest.config.ts:26` исключает `src/components/Carousel/**/*.tsx` из
  **покрытия** — измерения по всем компонентам нет (сами тесты на них есть).
- Вне `src/components/Carousel/**` покрытие не собирается вообще: `shared/`
  тестируется, но в отчёт не попадает (`include` — только Carousel).
- Нет тестов на: `Carousel.tsx` как единицу (кроме интеграционного),
  `useCarouselNavigation`, `useModuleRenderPolicy`, `Diagnostic.tsx`,
  `useCarouselStatusReporter` (есть только на его компаратор),
  `resolveImageSizes`, `useSlideViewport`, `Controls`/`NavigationZone`,
  `data-gen/runDataGen` (файловый драйвер), `useCarouselMotionExecution`.

---

## R. Поправки к записанному выше (по итогам механической проверки)

1. **Мохибейка НЕ повсеместна.** В выводе PowerShell она была артефактом
   консоли. В файлах ровно 3 места (grep по всем `.ts/.tsx/.scss`):
   `modules/Pagination/widget/usePaginationWidgetBinding.ts:65` (`≤`),
   `motion/tests/segmentFactory.test.ts:228` (`≈`),
   `state/tests/reducer.test.ts:150` (`±`).
2. **Замечание об инертной подписке `useMotionPaint` в `useKineticValue`
   снимается.** `useKineticValue` импортирует `useCompositedRide` из
   `./internal/motion` — из форка, где этой подписки нет вовсе. Двойной
   подписки не возникает.
3. Форки в `shared` **не разъехались по логике** — проверено пофайловым
   диффом всех 20 пар (см. § Q). Это снимает подозрение «копии могли
   разойтись незаметно»; единственное расхождение задокументировано в коде.
4. **Подозрение на «слепой каст» в `buildConfig.ts:36-37` снимается.**
   ADR-002 (`docs/adr/0002-trusted-runtime-inputs.md`, статус Accepted)
   объявляет ВСЕ входы caller-owned: компонент подставляет дефолт только для
   `undefined` и **сознательно не валидирует, не приводит и не чинит** ничего в
   проде. Некорректный вход обязан ломаться видимо на границе интеграции; за
   гигиену данных отвечает хост (экспортированные Zod-схемы), за наблюдаемость —
   dev-слот `<Diagnostic />`. Это же покрывает и «перерасход долей профиля»
   (`timing.ts:102,117`, `segmentFactory.ts:215`): не баг, а объявленный
   контракт. **Все `?` этого класса из §B и §E — не находки.**
5. **`engines/kinetic` не имеет ни одного потребителя.** Grep по всему `src`:
   `useKineticValue` импортируется только собственными тестами; из `shared`
   он реэкспортируется, но никем не берётся. 2163 строки + 13 тест-файлов —
   чистая «полка с заготовкой» вне графа зависимостей карусели.

---

## S. Решения разработчика (действуют постоянно)

1. **Свайп только для касаний — осознанное решение.** `usePointerSwipe.ts:422`
   (`pointerType !== "touch"` → выход) НЕ является багом. На десктопе навигация
   идёт через `<Controls>` и точки пагинации.
   *Следствие для оценки:* класс BUG/ARCH здесь не применяется. Остаётся
   находка уровня контракта/именования: публичный проп `isSwipeOn` (дефолт
   `true`) и имя `usePointerSwipe` не сообщают, что на pointer-устройстве они
   не решают ничего; в типах и в `public-api.md` это не выражено.
2. **`engines/kinetic` рассматривается ПОЛНОСТЬЮ** — как самостоятельный
   продукт: качество публичного API `useKineticValue`, готовность к выносу
   копированием, качество фасада поверх двух внутренних форков, покрытие.
   Отсутствие потребителей не является дефектом (это полка с заготовкой), но
   и не выводит его из пула оценок.
