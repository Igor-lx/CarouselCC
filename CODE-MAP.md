# CODE-MAP

Карта кодовой базы, построенная **только** по прочитанному коду рабочего дерева
ветки `fablefix`. Документация (`docs/`, `README.md`) при построении не
использовалась как источник: то, что здесь написано, взято из тел функций.
Комментарии в коде приводятся только там, где я их проверил по коду.

Журнал чтения — в конце файла (раздел 5).

---

## 0. Что это за репозиторий

Три физически разных вида кода в одном дереве:

| Область | Что это | Границы |
|---|---|---|
| `src/components/Carousel/client/**` | Собственно компонент карусели. Самодостаточный: наружу импортирует только `react`, `clsx`, `zod` и `src/shared`. | Публичный вход — `client/index.ts` (default export + типы). |
| `src/shared/**` | «Полка заготовок»: медиа-фасад, движки motion/gesture/kinetic, тема, фокус, слоты, числовые гварды. Внутри есть намеренные форки (см. §1.6). | Каждая папка задумана как переносимая целиком. |
| `src/app/**`, `src/main.tsx`, `index.html` | Тестовый стенд (демо-хост). Не часть компонента. | Кормит компонент данными и настройками. |
| `src/components/Carousel/data-gen/**` | Node-only генератор контента. Не импортируется браузерным кодом (проверено: импортов из `data-gen` в `client/` нет). | CLI + чистые функции. |
| `src/components/Carousel/boundary/**` | Только `README.md` + `tests/`. Продакшн-кода нет. | — |

Тест-раннер: `vitest`, окружение по умолчанию `node`, jsdom включается
пофайловой прагмой. Покрытие настроено на `src/components/Carousel/**` с
исключением всех `*.tsx` (то есть компоненты из метрики покрытия исключены
целиком).

TypeScript — solution-style: корневой `tsconfig.json` не содержит файлов,
проверяют только три референса (`app` / `node` / `test`). `tsc --noEmit` на
корне проверяет ноль файлов (это записано в самом конфиге и подтверждается
`"files": []`).

---

## 1. Картина сверху

### 1.1 Точки входа и выхода

**Входы компонента:**

1. `CarouselProps` (`client/public-api/types.ts`) — данные слайдов, числовые
   настройки, булевы переключатели, `className`-мапа, `userEnvironment`,
   колбэки, `children` (слоты), `ref`.
2. `children` как **слоты**: `resolveSlots(children, CAROUSEL_SLOTS)` разбирает
   детей по статическому полю `.slot` на компоненте
   (`pagination | controls | diagnostic | responsive-images`).
3. DOM-события: pointer-события через `usePointerSwipe` (только
   `pointerType === "touch"`), `contextmenu` на viewport, `mouseenter/leave` на
   viewport, `resize` окна, `ResizeObserver` на viewport,
   `IntersectionObserver` на viewport, `visibilitychange` документа,
   media-queries через глобальные сторы.
4. Окружение пользователя — **инжектится** хостом (`userEnvironment`),
   компонент сам его не детектит: в `Carousel.tsx` читаются только
   `userEnvironment?.reducedMotion / touch / dataSaver` с `?? false`.

**Выходы:**

1. DOM: `transform` трека (либо WAAPI-анимация, либо покадровая JS-запись),
   инлайн-стили точек пагинации, атрибуты состояния на корне
   (`data-breakpoint`, `data-orientation`, `data-moving`, `data-touch`,
   `data-reduced-motion`, `data-<flag>`), `data-active-zone` / `inert` /
   `data-image-status` на слайдах.
2. Колбэки: `onSlideClick(slide)`, `onCarouselStatusChange(snapshot)`.
3. Императивный хэндл `{ prev, next }` через `ref`.
4. `console.warn` / `console.info` — только dev-диагностика.

### 1.2 Слои и зоны ответственности

```
props ──► config (чистая сборка констант)
  │
  ├─► slides/useCarouselSlideDeck ──► records[] + CarouselLayout + perfectPageLayoutInfo
  │                                        │
  │                                        ▼
  ├─────────────────────────────► state/useCarouselState (reducer)  ◄── dispatch
  │                                        │  state: {virtualIndex, fromVirtualIndex,
  │                                        │          targetPageIndex, motionPhase, …}
  │            ┌───────────────────────────┼───────────────────────────┐
  │            ▼                           ▼                           ▼
  │   slides/useSlideRenderModel   motion/useMotionRunner       context/useModuleContextValue
  │   (virtualSlides, layoutOrigin)  │        │        │                │
  │            │                     │        │        │                ▼
  │            ▼                     │        │        │        модули-слоты
  │        SlideItem[]               │        │        │   (Controls / Pagination /
  │                                  │        │        │    Widget / ResponsiveImages /
  │                                  │        │        │    Diagnostic)
  │                                  ▼        ▼        ▼
  │                        MotionController  compositor  planChannel
  │                          (visual SSOT)   (WAAPI)     (observable)
  │                                  │        │            │
  │                                  └────────┴────────────┴──► geometry/useTrackBinding
  │                                                              (пишет transform трека)
  └─► gesture/useCarouselGesture ◄── shared/engines/gesture (usePointerSwipe)
```

**Ключевое разделение владения:**

| Что | Владелец | Тип хранилища |
|---|---|---|
| Логическая позиция (какая страница/виртуальный индекс — цель) | `state/reducer.ts` через `useReducer` | React-состояние |
| Визуальная позиция (где реально находится лента прямо сейчас) | `MotionController` (`shared/engines/motion/runtime/createMotionController.ts`) | вне React, RAF-цикл |
| Пиксельная отрисовка трека | `geometry/useTrackBinding.ts` | прямые записи в `style.transform` |
| План движения для «прочих» потребителей краски | `motion/planChannel.ts` | не-React observable |
| Размер слота (px) | `geometry/useSlotSizeSource.ts` | ref (сырой) + state (округлённый) |
| Статус загрузки картинок | `slides/imageResource/createImageResourceStore.ts` | не-React Map + listeners |
| Медиа-состояние | `shared/clientState/shared/useMediaQuery.ts` | **модуль-глобальные** сторы, один на строку запроса |
| Окружение (touch / dataSaver) | `shared/clientState/environment/**` | **модуль-глобальные** синглтоны |
| Тема | `shared/theme/ThemeStateProvider.tsx` | React-контекст + localStorage |

Из таблицы важен один факт: **позиция существует в двух местах** — логическая
(reducer) и визуальная (controller), и они синхронизируются только через две
точки: `MOTION_SETTLED` (controller → reducer) и `useMotionRunner`
(reducer → controller). Всё остальное читает визуальную позицию как истину
(`readCurrentPosition`).

### 1.3 Поток одного шага (клик «вперёд»)

1. `Controls` → `navigation.handleNext()` → `move(1, "click")` →
   `dispatch({type:"MOVE", step:1, fromVirtualIndex: readCurrentPosition()})`.
   `readCurrentPosition()` берёт **визуальную** позицию (сэмпл кривой, не DOM).
2. `useCarouselState.dispatch` оборачивает команду в envelope с
   `context = {layout, config, isInstantMode}` из рефов, обновляемых на каждом
   рендере.
3. `carouselReducer` сначала прогоняет `reconcileStateToLayout`, затем
   `resolveStepTransition`, вычисляет `nextVirtualIndex` / `nextTargetPageIndex`
   / фазу; для «повторного клика в ту же сторону во время движения» включает
   `isRepeatedClickAdvance` и умножает шаг на
   `REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES`.
4. Рендер: новые `state.virtualIndex/fromVirtualIndex/motionPhase`.
5. `useMotionRunner` (layout-effect) сравнивает ключ `replanInputs(...)`; если
   изменился — снимает handoff с контроллера, строит сегмент
   (`buildCarouselSegment`), считает стопы прогресса
   (`profileProgressStops`), пробует запустить WAAPI-анимацию трека
   (`startCompositorMotion`), запускает контроллер (пассивно, если WAAPI взял) и
   публикует план в `planChannel`.
6. `useTrackBinding` красит трек: при WAAPI — сам браузер, при фолбэке —
   покадрово по подписке на `visualPosition`.
7. `usePaginationFade` / `usePaginationWidgetBinding` подписаны на тот же
   `planChannel` и строят собственные WAAPI-анимации на той же кривой и с тем
   же `startedAt`.
8. Контроллер досэмплирует до конца → `onComplete` → `MOTION_SETTLED` с
   фактической позицией → reducer переводит фазу в `idle`.

### 1.4 Поток жеста

1. `usePointerSwipe` (движок) ловит `pointerdown` **только touch**, ставит
   `catchDelayMs`-таймер; если палец «пережил» окно — `onPressStart`.
2. `useCarouselGesture.startDragFromCurrentPosition`: читает текущую визуальную
   позицию, синхронно гасит компоновщик (`cancelTrackMotion`), пишет позицию,
   вычисляет страницу под пальцем (`pressedPageIndex`), и **откладывает**
   `START_DRAG` в `setTimeout(0)` (`pendingStartRef`).
3. Движения → `applyTrackPosition(offsetToPosition(uiOffset))` — прямая запись в
   контроллер (`controller.set`), без React.
4. Отпускание → `flushPendingStart()` (гарантия порядка START→END) →
   `resolveDragRelease` (чистая) → `dispatch(END_DRAG)` со скоростями,
   переведёнными из px/ms в «виртуальные единицы/ms» через
   `pointerVelocityToVirtual` (со сменой знака), и `releasedAt = motionNow()`.
5. `useMotionRunner` при `moveReason === "gesture"` экстраполирует позицию за
   «зазор коммита» (`resolveCoastedLaunchPosition`) и строит инерционный
   профиль (`buildGestureProfile`) с непрерывным запуском
   (`resolveReleaseLaunch`).

### 1.5 Побочные эффекты — полный перечень

| Эффект | Где | Отписка |
|---|---|---|
| `ResizeObserver` + `window.resize` | `useSlotSizeSource` | да, в cleanup |
| `IntersectionObserver` + `visibilitychange` | `shared/viewportObservation/useViewportVisibility` | да |
| `touchstart/end/cancel` (capture) + `scroll/resize` + `visualViewport.resize` | `shared/viewportObservation/useViewportBusy` | да |
| pointer-события, `click` (capture), `touchmove` (non-passive) | `shared/engines/gesture/swipe/usePointerSwipe` | да |
| `contextmenu` на viewport | `useCarouselGesture` | да |
| `setTimeout` — hover-пауза, autoplay-интервал, отложенный START_DRAG, ретрай картинки, veil fail-open, cooldown жеста, пассивный settle контроллера | разные | у всех есть clear |
| `requestAnimationFrame` — цикл контроллера, veil, dev-CSS-аудит | разные | да |
| WAAPI `element.animate` — трек, точки, виджет | `useTrackBinding`, `usePaginationFade`, `usePaginationWidgetBinding` | `cancel()` в cleanup |
| `requestIdleCallback` (или `setTimeout` 150мс) для предекода | `ResponsiveImages` | да |
| Запись в `localStorage` | `shared/theme/internal/storage.ts` | — (обёрнуто в try/catch) |
| Мутация `document.documentElement` (`data-theme`, `style.backgroundColor`) и `<meta name=theme-color>` | `ThemeStateProvider`, `BrowserChromeSync` | meta, созданная хуком, удаляется |
| `console.warn/info` | dev-диагностика, `resolveSlots` | — |
| Чтение `document.styleSheets` | `Diagnostic/checks/viewportChecks.ts` | dev-only |

**Глобальное состояние, переживающее размонтирование:**
`shared/clientState/shared/useMediaQuery.ts` (Map сторов по строке запроса),
`environment/**/useIsTouchDevice.ts` и `useDataSaver.ts` (модульные
переменные + Set слушателей), `progressCurve.isWaapiSupported` (кэш `boolean`).
Все три «сбрасываются в dormant» при обнулении слушателей (`initialized = false`),
но сама Map сторов не чистится никогда.

### 1.6 Намеренное дублирование в `shared/engines`

Проверено дифом, а не по документации:

* `shared/engines/kinetic/internal/gesture/**` — форк `shared/engines/gesture/**`.
  Все 9 общих файлов **побайтово совпадают по коду**; отличия только в тексте
  комментариев (пути к README) + в двух файлах BOM и мохибейк-символы.
  Форк **не экспортирует** `releaseKinetics.ts` (его в форке нет).
* `shared/engines/kinetic/internal/motion/**` — форк `shared/engines/motion/**`.
  10 из 12 файлов идентичны по коду; отличаются:
  * `index.ts` — форк не реэкспортирует `DEFAULT_RIDE_SHARES`, `RideDragBinding`,
    `CompositedRideDefaults`, `CompositedRideFlight`;
  * `compositor/compositedRide.ts` — форк урезан (142 строки против 280): нет
    `flyTo`, нет `dragBinding`, нет `CompositedRideDefaults`, `useCompositedRide`
    не подписывается на краску (`useMotionPaint`), `element`/`toKeyframe` —
    обязательные поля вместо опциональных.
* Карусель импортирует **только** `shared/engines/motion` и
  `shared/engines/gesture` (через общий `shared/index.ts`). `kinetic` каруселью
  не используется вообще.
* `shared/viewportObservation/useIsomorphicLayoutEffect.ts` — дремлющая копия;
  сам модуль импортирует общий `../hooks/useIsomorphicLayoutEffect`.
* `shared/clientState/media/library/*` и `.../media/useMedia/internal/*` —
  два комплекта одних и тех же примитивов (`useOrientation` идентичен,
  `useBreakpoint` содержит копию `resolveActiveBreakpoint` и товарищей).
* `shared/clientState/environment/library/*` и
  `.../environment/useUserEnvironment/internal/*` — попарно идентичны.

Практическое следствие для тестов: **у идентичных форков одинаковое
поведение**, и тест на один из них не является тестом на другой (это разные
модули с разным глобальным состоянием — например, у `library/useIsTouchDevice`
и `useUserEnvironment/internal/useIsTouchDevice` **отдельные** модульные
переменные и Set-ы слушателей).

---

## 2. Разбор снизу — карусель (`client/`)

### 2.1 `Carousel.tsx` (композиционный корень, 424 строки)

`memo(..., areCarouselPropsEqual)`. Порядок вызовов хуков в теле —
это и есть жёсткая последовательность зависимостей:

1. `resolveSlots(children, CAROUSEL_SLOTS)`;
   `isResponsiveImagesOn = Boolean(slots["responsive-images"])`.
2. `useSlideViewport()` — один `useMedia(SLIDE_VIEWPORT_AXES)`.
3. `useCarouselConfig(...)` — 5 сырых пропов → `CarouselRuntimeConfig`.
4. `useCarouselSlideDeck(...)` → `records`, `layout`, `perfectPageLayoutInfo`.
5. `useCarouselState({layout, config, isInstantMode})` → `state`, `status`, `dispatch`.
6. `carouselBoundaryState(state.targetPageIndex, layout)` → `isAtStart/isAtEnd`.
7. `slideMediaViews` — **только в DEV и только при `isContentImg`**; иначе
   замороженный пустой массив.
8. `useImageResourceStore(...)`.
9. `viewportRef`, `trackRef`.
10. `useSlotSizeSource({viewportRef, visibleSlidesCount: layout.visibleSlidesCount})`.
11. `resolveImageSizes(...)` — чистая функция, не хук.
12. `useCarouselStatusReporter(...)`.
13. `useVisualPosition({visibleSlidesCount})` → `source`, `controller`, `applyImmediatePosition`.
14. `useSlideRenderModel(...)` — важно: `isMoving: !status.isIdle`, то есть
    **включая drag** (комментарий это утверждает, код подтверждает).
15. `useActiveBandGate(...)`.
16. `planChannelRef` — создаётся лениво в теле рендера (не в эффекте).
17. `useTrackBinding(...)`.
18. `useCarouselMotionExecution(...)` — тонкая обёртка над `useMotionRunner`,
    подставляющая `onSettle = dispatch(MOTION_SETTLED)`.
19. `useCarouselNavigation({enabled: layout.canSlide, ...})`.
20. `useImperativeHandle(ref, () => ({prev, next}))`.
21. `useCarouselGesture(...)` — получает
    `inFlightTargetPageIndex: status.isIdle ? null : state.targetPageIndex`.
22. `useCarouselAutoplay(...)`.
23. `useFocusRecovery(...)`.
24. `useModuleRenderPolicy(...)` → гейтированные слоты.
25. `useModuleContextValue(...)` — **обнуляет** `visualPosition` и `motionPlan`,
    если `isInstantMode`.
26. `useDiagnosticContextValue(...)`.
27. `useCarouselPresentation(...)`.

Разметка: корень (атрибуты состояния) → viewport (`{...dragHostProps}`,
hover-хендлеры) → трек (`ref={trackRef}`) → `.slideSizer` (единственный
in-flow ребёнок, задаёт высоту) → `SlideItem[]` → `moduleSlots.controls`;
за viewport — pagination / responsiveImages / diagnostic.

### 2.2 `areCarouselPropsEqual.ts`

Компаратор `memo`. Верхний уровень: сравнение количества ключей, затем
`Object.is` по всем ключам **кроме** `children`; `children` сравниваются
структурно (`areChildrenEquivalent`): длина плоского списка, затем поэлементно
`Object.is` → `isValidElement` обоих → равенство `type` и `key` → мелкое
сравнение пропсов с рекурсией по `children` до глубины
`MAX_CHILD_COMPARE_DEPTH = 4`; на пределе возвращает `false` (то есть
«изменилось» — отказ в безопасную сторону).

### 2.3 `config/`

Чистая сборка. `buildCarouselConfig` подставляет дефолты **только для
`undefined`** (`useDefault` проверяет `typeof value === "undefined"`, то есть
`null`, `NaN`, отрицательные числа проходят как есть — валидации нет, это
осознанно: их ловит dev-диагностика). `useCarouselConfig` мемоизирует по пяти
сырым значениям.

Заметное: `swipeConfig` копируется поверхностно + отдельно копируется
`commit`, `releaseConfig` — поверхностной копией. То есть возвращаемый конфиг
не разделяет объекты с модульными константами (кроме вложенных примитивов).

`config/viewport.ts` строит `SLIDE_CANONICAL_SOURCE_MEDIA` через
`canonicalMediaQueries(SLIDE_VIEWPORT_AXES)` — то есть строки `<source media>`
и подписки медиа-фасада выводятся из одного места.

### 2.4 `domain/` (чистая математика)

* `math.ts` — `mod` (возвращает 0 при `total <= 0`), `clamp`,
  `normalizePageIndex`.
* `layout.ts`
  * `buildCarouselLayout`: `effectiveVisible = min(visible, length)`;
    `canSlide = length > effectiveVisible`; `pageCount = ceil(length/effectiveVisible)`;
    `virtualLength = canSlide && !isFinite ? pageCount*effectiveVisible : length`;
    `dataKey` — конкатенация `slideKey-typeof:content` по всем записям
    (react-элемент → литерал `"react-element"`, то есть **два разных
    react-элемента дают одинаковый ключ**).
  * `alignedVirtualIndex` — приводит страницу к «полосе» относительно
    референса, период = `virtualLength`.
  * `pageContaining` — **floor**; `nearestPageIndex` — **round**. Разные
    функции, используются в разных местах (pressedPage vs release-snap).
  * `carouselBoundaryState` — в циклическом режиме всегда `{false,false}`.
  * `reconciledPageIndex` — пропорциональный перенос страницы при смене
    `pageCount`; при `pageCount <= 1` с любой стороны → 0.
* `slides.ts`
  * `buildSlideRecords` — ключ `slide:{id}`.
  * `hasPartialPageLayout` / `padDeckToFullPage` — доклейка клонами
    (`slide:{id}:layout-clone:{index}`), клон делит **тот же** `slideData`.
  * `resolveLargestSrcSetCandidate` — парсит `srcSet`, дескриптор без `w`
    считается шириной 0; при равенстве ширин побеждает первый.
  * `resolveRenderedImageSrc` — **единое правило ключа URL**: не-строковый
    `content` → `null`; при включённом responsive → сам `content`; иначе
    `image.defaultSrc ?? крупнейший кандидат ?? content`.
  * `deckCarriesImageSets` — есть ли хоть у одного слайда `srcSet`/`sources`.
* `track.ts`
  * `trackPixelTransform` — округление до 4 знаков; нефинитное → 0.
  * `trackCssTransform` — доизмерительный фолбэк в процентах.
  * `slideLane(virtualIndex, layoutOrigin)` — просто разность.
  * `measureSlotSize(viewport, n, width=offsetWidth)` — читает
    `getComputedStyle` и берёт **первое непустое** из
    `--slides-gap | --gap | gap | column-gap`; результат `(width + gap)/n`.
  * `pointerVelocityToVirtual` — **отрицание** и деление на слот; при
    `slotSize <= 0` → 0.
* `renderWindow.ts` — при `!canSlide` окно `[0, length-1]` (буфер игнорируется);
  иначе `[floor(min)-buffer, ceil(max)+visible-1+buffer]`, в finite-режиме
  клампится к `[0, length-1]`.
* `visibility.ts` — `isActual` = индекс в текущей полосе; при движении
  `isActive` дополнительно включает полосу, которая была видна на старте.
* `dragRelease.ts` — чистое разрешение цели отпускания. Ветки:
  направление `left/right` → сосед от `dragOriginPageIndex`; `isSnap` истинно,
  когда цель совпала с origin (в finite-режиме на краю). Без направления:
  либо `pressedPageIndex ?? dragOriginPageIndex` (перехват летящей ленты),
  либо `nearestPageIndex(releasePosition)`.

### 2.5 `state/`

* `types.ts` — `CarouselState` c девятью полями; `MotionPhase` из шести
  значений; команды `MOVE | GO_TO | START_DRAG | END_DRAG | MOTION_SETTLED`;
  envelope несёт `context`.
* `initial.ts` — `buildInitialState`, `motionStatus(phase)` →
  `{isIdle, isMoving, isDragging, isJumping}` (`isMoving` **исключает** drag).
* `reconcile.ts` — `sameLayout` сравнивает `dataKey`, `visibleSlidesCount`,
  `isFinite`, `pageCount`. Смена `dataKey` или `isFinite` → **полный сброс**
  в initial. Иначе — пропорциональный перенос страницы и фаза `step-instant`.
* `transitions.ts`
  * `stepOrigin` — при повторном клике «в ту же сторону» страница берётся из
    **визуальной** позиции (`floor`/`ceil` по направлению), иначе из
    `state.targetPageIndex`; референс полосы — `state.virtualIndex`, если
    движение уже в очереди.
  * `resolveStepTransition` — для `GO_TO` считает `resolveGoToPlan`; при
    телепорте `nextVirtualIndex` = посадка префлайта, финал уезжает в
    `nextTeleportVirtualIndex`.
  * `isSameDirectionRepeat` — требует ненулевого направления, не-idle и
    не-dragging фазы и совпадения знака `virtualIndex - fromVirtualIndex`.
* `reducer.ts` — на каждый envelope сначала `reconcileStateToLayout`, затем
  switch. Особые места:
  * `END_DRAG` при уже достигнутой цели (`hasReachedDragTarget`) → сразу `idle`;
  * «нулевой» `MOVE/GO_TO` (`isNoop`) сохраняет `isRepeatedClickAdvance`, чтобы
    раннер пересобрал сегмент;
  * `MOTION_SETTLED`: если фактическая позиция отличается от `virtualIndex`
    больше `epsilon` — считается, что цель подменили на лету, движение
    сохраняется, меняется только `fromVirtualIndex`; если ожидался телепорт —
    режется середина и стартует ограниченный подлёт (`isTeleportApproach`).
* `validateState.ts` — чистый валидатор трёх структурных инвариантов;
  **редьюсер его не вызывает**, вызывает только dev-диагностика.
* `useCarouselState.ts` — `useReducer` + пересчёт `reconcileStateToLayout` на
  каждом рендере (`effectiveState`), рефы для `layout/config/isInstantMode`
  обновляются **во время рендера** (не в эффекте), `dispatch` стабилен.

### 2.6 `motion/`

* `timing.ts` — единственный источник геометрии GO_TO. `resolveGoToPlan`
  включает телепорт **только** если: телепорт разрешён, промежуточных страниц
  ≥ `goToTeleportMinPageSpan` **и** есть хотя бы одна полностью пропускаемая
  страница (`intermediatePages > preflight + approach`). Длительности префлайта
  и подлёта считаются аналитически из долей разгона/торможения; при
  «перебюджете» доли не клампятся (круизный член уходит в минус) — это
  осознанное «доверяем автору», о чём есть отдельная dev-проверка.
* `duration.ts` — `durationByVirtualSpan` (линейно по числу страниц),
  `resolveStepDuration`: snap → фиксированная длительность, instant → 0,
  click/gesture → пропорционально пролёту, autoplay → фиксированная.
* `segmentFactory.ts` — `intentFromState` определяет одно из 10 намерений по
  полям состояния (порядок веток значим: instant → teleport-preflight →
  teleport-approach → snap → jump → repeated-click → по `moveReason`).
  Дальше — четыре сборщика профиля: шаг, повторный клик, жест, GO_TO
  (три фазы). У GO_TO есть «потолок по времени полёта»: непрерывная поездка
  не может быть медленнее телепортной.
* `planChannel.ts` — минимальный observable с монотонным `planId` и
  **дедупликацией** повторного `idle` и одинакового `follow`.
* `useMotionRunner.ts` — центральный эффект (layout-effect). Ключ ре-планирования
  собирается из `replanInputs()` — один список, который одновременно и массив
  зависимостей, и строковый ключ дедупликации (`inputs.join(":")`).
  Ветвление: `!canSlide` → snap+idle; `idle` → snap+idle; `dragging` →
  заморозить компоновщик на живом сэмпле + `follow`; `step-instant` → snap +
  `instant`; иначе — построить и запустить сегмент.
  Отдельная ветка «в полёте» (`controller.isActive()`) берёт атомарный
  `captureHandoff`; «холодный старт» жеста добавляет coast-экстраполяцию;
  прочий холодный старт берёт позицию из редьюсера, а скорость — из контроллера.
  При префлайте план для «одношаговых» потребителей перестраивается на
  **единичном** шаге, чтобы охватить префлайт+подлёт целиком.
* `useCarouselMotionExecution.ts` — только подстановка `onSettle`.

### 2.7 `visual-position/`

`useVisualPosition` оборачивает `MotionController` в источник кадров:
`position`, `pageOffset` (позиция / число видимых), `velocity`, `target`,
`progress`, `phase` и `runningFrameIndex` — счётчик кадров внутри текущей
«бегущей» серии, штампуемый **в одном месте**, чтобы все потребители
сбрасывали одни и те же кадры (`isDroppedFallbackFrame`).
`sampleNow()` использует `captureHandoff()` (точная позиция на кривой),
`getSnapshot()` — последний **отправленный** кадр.

### 2.8 `geometry/`

* `useSlotSizeSource` — единственное измерение слота в компоненте. Хранит
  сырой размер в ref (`getSlotSize`, не вызывает ререндер) и округлённый в
  state (`slotPx`, порог `SLOT_SIZE_EPSILON_PX = 1`). `ResizeObserver` читает
  `contentRect.width` и отсекает изменения < `VIEWPORT_RESIZE_EPSILON_PX = 0.5`;
  слушатель `window.resize` вызывает `remeasure()` **без** порога.
  `measure()` возвращает «сдвинулось ли» по **строгому** `!==` на сыром
  значении. Возвращаемый объект мемоизирован — это существенно, потому что от
  него зависят эффекты подписки в `useTrackBinding`.
* `useTrackBinding` — весь DOM-контакт трека:
  * `resolveTransform` — пиксельный трансформ, если слот измерен, иначе
    CSS-`calc`;
  * `writePosition(position, source)` — при активной WAAPI-анимации пропускает
    записи с `source === "frame"`;
  * `startCompositorMotion` — отказывается (возвращает `false`), если нет
    элемента/слота, нефинитные границы, `duration <= 0` или меньше двух стопов;
    синхронно красит origin, вешает `onfinish`/`oncancel`;
  * `cancelCompositorMotion(position?)` — без аргумента платит
    `getComputedStyle`; в конце **всегда** зовёт `visualPosition.wake()`;
  * `rebaseTrack` — читает позицию **до** сноса анимации;
  * три подписки: на смену `layoutOrigin`/`visibleSlidesCount`, на сдвиг слота
    (`subscribeSlotSize`) и на план (только чтобы знать, фолбэчный ли follow);
  * покадровая подписка на `visualPosition` с `emitCurrent: true`.

### 2.9 `gesture/`

* `coast.ts` — чистая экстраполяция позиции за «зазор коммита», с клампом
  интервала и отсечкой перелёта цели.
* `slotAdaptiveSwipe.ts` — перевод «контент-относительной» настройки в
  абсолютную для движка: `swipeThresholdRatio` обнуляется, `minSwipeDistance`
  считается как `clamp(slot*slotShare, minPx, maxPx)`, `resistanceCurvature`
  масштабируется **обратно** слоту, флик-пороги — **прямо** слоту. До первого
  измерения отдаётся пол (`commit.minPx`).
* `useCarouselGesture.ts` — мост движок↔редьюсер. Существенное:
  * отложенный `START_DRAG` через `setTimeout(0)` + принудительный
    `flushPendingStart()` перед `END_DRAG` и в эффекте отключения;
  * `slotSizeRef` снимается **один раз** на старте перетаскивания;
  * `pressedPageIndex` считается из `getBoundingClientRect()` viewport и
    `pageContaining(floor(origin + lane))`;
  * `contextMenuSeenRef` отличает «долгое нажатие с меню» от «страница
    прокрутилась», что меняет решение при безнаправленном отпускании;
  * эффект «поверхность исчезла»: при `!isSwipeOn` с активным drag —
    искусственный `END_DRAG` с нулевыми скоростями; при `!canSlide` — просто
    чистка рефов.

### 2.10 `slides/`

* `useCarouselSlideDeck` — records → (опциональная доклейка) → layout →
  сводка `perfectPageLayoutInfo`.
* `useSlideRenderModel` — окно рендера с «залипанием»: при движении окно только
  расширяется (`expandWindow`), сжимается на покое. `layoutOrigin` меняется
  только при уходе окна за `LAYOUT_ORIGIN_BAND_SLOTS = 512` слотов. Кэш
  `VirtualSlide` по виртуальному индексу: объект переиспользуется, пока
  совпадают `isActive`, `isActual`, `slideKey`, `slideData`; вышедшие из окна
  индексы удаляются.
* `SlideItem.tsx` — тег `button` (когда кликабельно) или `div`; `inert` при
  `!isActive`; `data-active-zone={isActual}`; при `!isFetchOn` элемент
  `<img>` **не монтируется вовсе** (иначе `<picture>` подобрал бы кандидата);
  `key` на `<img>` — `generation` только вне `<picture>`, внутри ключ несёт
  `<picture>`; `loading`/`fetchPriority` зависят от `isActual` и `dataSaver`.
* `useActiveBandGate` — двухволновой гейт: собирает URL текущей полосы
  (стабилизируя массив по содержимому), подписывается на стор ресурсов и
  открывает гейт, когда каждый URL полосы хоть раз доложил исход
  (`status !== "loading"`). Пустая полоса или отсутствие стора → открыт сразу.
* `useOrientationSwapVeil` — реагирует **только на смену `viewportSignature`**;
  поднимает вуаль по `decode()`/`load`/`error`, с fail-open по
  `veilMaxMs`; в cleanup обязательно снимает вуаль.
* `imageResource/`
  * `createImageResourceStore` — Map записей + Map слушателей;
    неизвестный URL читается как `loading`; `reportError` инкрементит счётчик;
    `requestRetry` дедуплицируется по наличию таймера, ограничен `maxAttempts`,
    задержка `min(maxDelay, base * 2^(failureCount-1))`; успешный ретрай
    инкрементит `generation` (это заставляет слайд перемонтировать `<img>`);
    `prune(allowed)` удаляет всё лишнее вместе с таймерами; `dispose()` мягкий.
  * `useImageResource` — `useSyncExternalStore`; для «неотслеживаемого» слайда
    отдаёт замороженный `loaded`-снимок и no-op колбэки.
  * `useImageResourceRetention` — считает живые URL тем же
    `resolveRenderedImageSrc` и зовёт `prune`.
  * `useImageResourceStoreInstance` — создаёт стор **в теле рендера** при
    `enabled`, мягко «диспозит» при выключении и на размонтировании, ref
    сохраняет инстанс для повторного использования.

### 2.11 `modules/`

* **Controls** — читает `isAtStart/isAtEnd` и рисует ноль-две зоны. В
  циклическом режиме границы всегда `false`, значит обе зоны есть всегда.
* **Pagination (basic)** — точки + `usePaginationFade`. Ключевая идея: React
  мгновенно переставляет класс активной точки, а биндинг маскирует это
  собственной анимацией. Биндинг:
  * читает «внешний вид» точки из CSS-переменных (`--pagination-dot-opacity`,
    `…-active`, `…-scale-active`) с фолбэками;
  * владеет инлайн-слоем (`opacity`, `transform`, `transition: none`) ровно
    пока идёт движение, и отдаёт его обратно классам на `settle`;
  * три режима: `sweep` (offset едет по стопам плана), `direct`
    (кросс-фейд для GO_TO с телепортом) и `follow` (покадрово, дельтой по
    `pageOffset`);
  * гейт покадровой записи стоит на **безразмерной** «силе активности», а не
    на opacity.
* **PaginationWidget** — «лента» из фиксированного пула элементов.
  Геометрия (`spatialField`) строит позиции и масштабы слотов; `projection`
  проецирует id точки в x/scale/opacity/activeStrength; `trajectory` сворачивает
  временные стопы плана и пространственный путь в один список кейфреймов.
  Биндинг держит собственный счётчик шагов (`offsetRef`), две «памяти» шага
  (текущий и прерванный хватом), эпсилон-гейты на запись, пул из
  `slotCount = widgetProjectionSlotCount(visibleCount) + DOT_COVERAGE_MARGIN_SLOTS`
  точек и `ACTIVE_DOT_COUNT` оверлеев. `resolveWidgetStepTarget` ограничивает
  «убегание» цели `WIDGET_STEP_LOOKAHEAD`.
* **ResponsiveImages** — headless. Само присутствие включает адаптивный стек
  (это читается в `Carousel.tsx`). Тело — предекодер: в простое находит
  `[data-active-zone="false"] img`, ставит очередь и декодирует копии в
  `requestIdleCallback`.
* **Diagnostic** — dev-only, `IS_DEV` — build-time константа. Собирает
  предупреждения из шести источников (константы, оси viewport, пропсы, данные
  слайдов, layout, слоты, состояние) плюс отложенный аудит таблиц стилей;
  выводит через `useGroupedWarnings` с дедупликацией по подписи.
  `constantChecks.ts` (826 строк) — таблица числовых правил + семь отдельных
  «реляционных» проверок (сумма долей, соотношения таймингов, границы
  бюджета разгона GO_TO и т.д.).

### 2.12 Прочие мелкие слои

* `navigation/` — 4 обработчика поверх `dispatch`; всё гейтится `enabled`
  (`layout.canSlide`).
* `autoplay/` — `useAutoplay` (таймер + hover-пауза с задержкой) и
  `useCarouselAutoplay` (склейка с видимостью, «занятостью» viewport и фазой
  движения). `shouldDeferTick` — **геттер**, а не реактивный флаг.
* `focus/useFocusRecovery` — реагирует на переход в `idle` или смену страницы,
  зовёт `manageFocusShift`.
* `host-report/` — дедуплицированный колбэк статуса (сравнение по 5 полям).
* `presentation/` — классы (`mergeStyleMaps`), корневые CSS-переменные,
  кэш стилей полосы по виртуальному индексу, `data-<flag>` атрибуты.
* `render-policy/` — какие слоты реально рендерить: controls/pagination требуют
  `canSlide` и своего флага; diagnostic — только DEV.
* `context/` — три контекста: `Stable` (низкочастотный), `Motion`
  (перестраивается на каждом переходе), `Diagnostic` (в проде — замороженная
  заглушка).

---

## 3. Разбор снизу — `shared/`

* **`math/numeric.ts`** — 10 гвардов, все через `isFiniteNumber`.
* **`slots/resolveSlots.ts`** — читает статическое поле `.slot` у типа
  элемента; неизвестный слот и дубль слота предупреждают только в DEV,
  побеждает **последний**.
* **`styles/mergeStyleMaps.ts`** — конкатенация строк классов, пустые значения
  пропускаются.
* **`focus/manageFocusShift.ts`** — работает по строковым контрактам DOM:
  `[data-active-zone]`, `[data-active-zone="true"]:not([inert])`, набор
  фокусируемых селекторов. Если активный элемент вне контейнера — ничего не
  делает.
* **`viewportObservation/`**
  * `useViewportVisibility` — при отсутствии `IntersectionObserver`
    деградирует в «всегда виден» (осознанно, есть комментарий и код).
  * `useViewportBusy` — возвращает **геттер**, не ререндерит; считает пальцы и
    время последнего сигнала.
* **`clientState/`**
  * `shared/useMediaQuery.ts` — один стор на строку запроса, ленивое чтение,
    отсоединение слушателя при обнулении подписчиков (`initialized = false`),
    сама Map сторов не очищается.
  * `media/useMedia/useMedia.ts` — вызывает `useMediaQuery` **в цикле** по
    `canonicalMediaQueries(axes)`; отсюда контракт «оси — статическая
    константа». `signature` — битовая строка вердиктов, единственная
    зависимость итогового `useMemo`. `matches()` для неканонической строки
    падает в прямой `window.matchMedia`.
  * `media/useMedia/internal/resolveActiveBreakpoint.ts` — сортировка по
    убыванию порога, первый совпавший, иначе самый узкий.
  * `environment/**` — три сигнала; `useIsTouchDevice` дополнительно ставит
    одноразовый `pointerdown`-слушатель, чтобы поймать гибрид.
* **`engines/motion/`**
  * `profile/profile.ts` — три зоны (разгон/круиз/торможение) по долям
    расстояния; доли **не** нормализуются, перебюджет даёт отрицательный круиз,
    и такая зона просто не добавляется (`pushZone` при `share <= 0`).
    Внутри зоны скорость интерполируется `smoothstep`, расстояние —
    аналитическим интегралом `smoothstepIntegral`.
  * `profile/progressCurve.ts` — плотность стопов выводится из кривой (шаг
    относительной скорости ~5%), клампится в `[32, 256]`; `profileProgressStops`
    принудительно монотонна, концы точные; `resolvePeakSpeedForDuration` —
    решение квадратного уравнения; `positionAtNow`, `keyframesAlongStops`,
    `isWaapiSupported` (кэш).
  * `runtime/createMotionController.ts` — конечный автомат кадров:
    `start` (активный RAF или **пассивный** режим с одним `setTimeout` на
    конец), `set`, `snap`, `cancel`, `wake`, `captureHandoff` (атомарный,
    ничего не эмитит), `getSnapshot` (последний эмитированный),
    `destroy` (мягкий).
  * `compositor/compositedRide.ts` — «под ключ» путь для одного элемента
    (каруселью не используется: она собирает то же самое из примитивов в
    `useTrackBinding`).
* **`engines/gesture/`**
  * `usePointerSwipe.ts` — фазы `idle → press → dragging → cooldown`; вся
    механика в рефах, ререндер только при смене host-элемента. Владение
    жестом берётся по таймеру `catchDelayMs`; вертикальный увод завершает жест
    как `vertical-scroll`; скорости считаются по **времени события**, а не
    обработчика; отдельно ведутся «быстрая» EMA (`uiVelocity`) и «медленная»
    память флика (`flickVelocity`, `launchVelocity`), которые на отпускании
    декейятся по правилу паузы (grace + half-life).
  * `resolveSwipeDirection.ts` — при флике направление берётся от **скорости**,
    а не от смещения; при дистанционном свайпе — от смещения.
  * `inertia/*` — `sameDirectionSpeed` (скорость против направления = 0),
    `resolveInertialRelease` (флик = быстрее базового темпа),
    `resolveReleaseLaunch` (старт не выше видимой скорости, круиз не ниже
    старта), `releaseKinetics` (фасад, каруселью не используется).
* **`theme/`** — состояние в React, применение к `documentElement`, синк
  `<meta name=theme-color>`, зеркалирование ключа/цветов в `index.html`
  (pre-paint boot).
* **`icons/ChevronIcon.tsx`** — SVG с поворотом по направлению.

---

## 4. Наблюдения, важные для планирования тестов

Это не баги (баги — отдельный артефакт при их появлении), а факты, которые
меняют цену тестов:

1. **Один сегмент — три потребителя краски** (трек, точки, виджет). Они
   синхронизированы не общим кодом, а общими `stops`, `duration` и `startedAt`
   плюс общим правилом пропуска кадров `isDroppedFallbackFrame`. Это самая
   «связная» зона в проекте.
2. **Позиция живёт в двух представлениях** (reducer / controller) и
   синхронизируется двумя узкими каналами. Всё, что читает позицию для решения
   (`readCurrentPosition`), берёт визуальную.
3. **Дедупликация в `planChannel`** означает, что «повторно тот же план» не
   доедет до потребителей.
4. **Ключ ре-планирования в `useMotionRunner`** — строка. Состояния с
   одинаковым набором полей не приводят к перепланированию.
5. **Диагностика — единственный потребитель `validateCarouselState`** и
   существует только в DEV.
6. **Форки в `shared/engines`** идентичны по коду, но это разные модули с
   разным глобальным состоянием.
7. **Модульные синглтоны** (`useMediaQuery`, `useIsTouchDevice`, `useDataSaver`)
   переживают тесты: без сброса состояние течёт между тестами в одном файле.
8. Найдено **6 продакшн-файлов с UTF-8 BOM** и мохибейком в комментариях (пять
   в `kinetic/internal/**`, плюс
   `modules/Pagination/widget/usePaginationWidgetBinding.ts`). На поведение не
   влияло. **Исправлено отдельным коммитом** (`chore(encoding)`) — только BOM и
   символы в комментариях. Тот же артефакт остался в 24 тестовых файлах: их
   правлю на Этапе 5, когда итоговый набор тестов известен, чтобы правка не
   смешалась с удалениями.

---

## 5. Журнал чтения

Всего прочитано **248 файлов** (продакшн-код + конфигурация + стили +
`index.html`). Тестовые файлы (99 шт., 13 665 строк) в этот журнал не входят —
они предмет Этапа 2.

Для 19 файлов форка `shared/engines/kinetic/internal/**` в колонке отмечено,
что чтение выполнено через полный `diff` против оригинала, который прочитан
построчно; сам diff приведён в §1.6 и показывает, что расхождения — только в
тексте комментариев.

| # | Файл | Строк | Прочитан полностью |
|---|------|-------|--------------------|
| 1 | `package.json` | 42 | да |
| 2 | `vitest.config.ts` | 30 | да |
| 3 | `vite.config.ts` | 11 | да |
| 4 | `tsconfig.json` | 15 | да |
| 5 | `tsconfig.app.json` | 37 | да |
| 6 | `tsconfig.node.json` | 29 | да |
| 7 | `tsconfig.test.json` | 14 | да |
| 8 | `index.html` | 59 | да |
| 9 | `src/app/App.module.scss` | 118 | да |
| 10 | `src/app/App.tsx` | 215 | да |
| 11 | `src/components/Carousel/client/Carousel.module.scss` | 215 | да |
| 12 | `src/components/Carousel/client/Carousel.tsx` | 424 | да |
| 13 | `src/components/Carousel/client/areCarouselPropsEqual.ts` | 99 | да |
| 14 | `src/components/Carousel/client/autoplay/useAutoplay.ts` | 92 | да |
| 15 | `src/components/Carousel/client/autoplay/useCarouselAutoplay.ts` | 61 | да |
| 16 | `src/components/Carousel/client/config/defaults.ts` | 20 | да |
| 17 | `src/components/Carousel/client/config/gesture.ts` | 36 | да |
| 18 | `src/components/Carousel/client/config/index.ts` | 59 | да |
| 19 | `src/components/Carousel/client/config/interaction.ts` | 10 | да |
| 20 | `src/components/Carousel/client/config/layout.ts` | 4 | да |
| 21 | `src/components/Carousel/client/config/legacyPaint.ts` | 3 | да |
| 22 | `src/components/Carousel/client/config/motion.ts` | 24 | да |
| 23 | `src/components/Carousel/client/config/resolve/buildConfig.ts` | 106 | да |
| 24 | `src/components/Carousel/client/config/resolve/useCarouselConfig.ts` | 30 | да |
| 25 | `src/components/Carousel/client/config/slides.ts` | 16 | да |
| 26 | `src/components/Carousel/client/config/types.ts` | 138 | да |
| 27 | `src/components/Carousel/client/config/viewport.ts` | 31 | да |
| 28 | `src/components/Carousel/client/context/CarouselDiagnosticContext.ts` | 13 | да |
| 29 | `src/components/Carousel/client/context/CarouselModuleContext.ts` | 29 | да |
| 30 | `src/components/Carousel/client/context/index.ts` | 22 | да |
| 31 | `src/components/Carousel/client/context/types.ts` | 104 | да |
| 32 | `src/components/Carousel/client/context/useDiagnosticContextValue.ts` | 152 | да |
| 33 | `src/components/Carousel/client/context/useModuleContextValue.ts` | 138 | да |
| 34 | `src/components/Carousel/client/domain/dragRelease.ts` | 59 | да |
| 35 | `src/components/Carousel/client/domain/index.ts` | 38 | да |
| 36 | `src/components/Carousel/client/domain/layout.ts` | 106 | да |
| 37 | `src/components/Carousel/client/domain/math.ts` | 12 | да |
| 38 | `src/components/Carousel/client/domain/renderWindow.ts` | 57 | да |
| 39 | `src/components/Carousel/client/domain/slides.ts` | 94 | да |
| 40 | `src/components/Carousel/client/domain/track.ts` | 60 | да |
| 41 | `src/components/Carousel/client/domain/types.ts` | 46 | да |
| 42 | `src/components/Carousel/client/domain/visibility.ts` | 35 | да |
| 43 | `src/components/Carousel/client/focus/useFocusRecovery.ts` | 30 | да |
| 44 | `src/components/Carousel/client/geometry/index.ts` | 8 | да |
| 45 | `src/components/Carousel/client/geometry/resolveImageSizes.ts` | 19 | да |
| 46 | `src/components/Carousel/client/geometry/useSlotSizeSource.ts` | 148 | да |
| 47 | `src/components/Carousel/client/geometry/useTrackBinding.ts` | 293 | да |
| 48 | `src/components/Carousel/client/gesture/coast.ts` | 39 | да |
| 49 | `src/components/Carousel/client/gesture/index.ts` | 2 | да |
| 50 | `src/components/Carousel/client/gesture/slotAdaptiveSwipe.ts` | 45 | да |
| 51 | `src/components/Carousel/client/gesture/useCarouselGesture.ts` | 307 | да |
| 52 | `src/components/Carousel/client/host-report/statusSnapshot.ts` | 13 | да |
| 53 | `src/components/Carousel/client/host-report/useCarouselStatusReporter.ts` | 40 | да |
| 54 | `src/components/Carousel/client/index.ts` | 14 | да |
| 55 | `src/components/Carousel/client/modules/Controls/Controls.module.scss` | 125 | да |
| 56 | `src/components/Carousel/client/modules/Controls/Controls.tsx` | 35 | да |
| 57 | `src/components/Carousel/client/modules/Controls/NavigationZone.tsx` | 33 | да |
| 58 | `src/components/Carousel/client/modules/Controls/index.ts` | 2 | да |
| 59 | `src/components/Carousel/client/modules/Controls/types.ts` | 11 | да |
| 60 | `src/components/Carousel/client/modules/Diagnostic/Diagnostic.tsx` | 111 | да |
| 61 | `src/components/Carousel/client/modules/Diagnostic/checks/constantChecks.ts` | 826 | да |
| 62 | `src/components/Carousel/client/modules/Diagnostic/checks/index.ts` | 16 | да |
| 63 | `src/components/Carousel/client/modules/Diagnostic/checks/layoutChecks.ts` | 140 | да |
| 64 | `src/components/Carousel/client/modules/Diagnostic/checks/propChecks.ts` | 139 | да |
| 65 | `src/components/Carousel/client/modules/Diagnostic/checks/stateChecks.ts` | 25 | да |
| 66 | `src/components/Carousel/client/modules/Diagnostic/checks/viewportChecks.ts` | 241 | да |
| 67 | `src/components/Carousel/client/modules/Diagnostic/checks/widgetChecks.ts` | 79 | да |
| 68 | `src/components/Carousel/client/modules/Diagnostic/formatter.ts` | 50 | да |
| 69 | `src/components/Carousel/client/modules/Diagnostic/index.ts` | 3 | да |
| 70 | `src/components/Carousel/client/modules/Diagnostic/types.ts` | 12 | да |
| 71 | `src/components/Carousel/client/modules/Diagnostic/useGroupedWarnings.ts` | 26 | да |
| 72 | `src/components/Carousel/client/modules/Diagnostic/useWidgetDiagnostic.ts` | 30 | да |
| 73 | `src/components/Carousel/client/modules/Pagination/basic/Pagination.module.scss` | 86 | да |
| 74 | `src/components/Carousel/client/modules/Pagination/basic/Pagination.tsx` | 54 | да |
| 75 | `src/components/Carousel/client/modules/Pagination/basic/PaginationDot.tsx` | 59 | да |
| 76 | `src/components/Carousel/client/modules/Pagination/basic/fadeKeyframes.ts` | 128 | да |
| 77 | `src/components/Carousel/client/modules/Pagination/basic/index.ts` | 2 | да |
| 78 | `src/components/Carousel/client/modules/Pagination/basic/types.ts` | 13 | да |
| 79 | `src/components/Carousel/client/modules/Pagination/basic/usePaginationFade.ts` | 552 | да |
| 80 | `src/components/Carousel/client/modules/Pagination/index.ts` | 10 | да |
| 81 | `src/components/Carousel/client/modules/Pagination/widget/PaginationWidget.module.scss` | 110 | да |
| 82 | `src/components/Carousel/client/modules/Pagination/widget/PaginationWidget.tsx` | 143 | да |
| 83 | `src/components/Carousel/client/modules/Pagination/widget/PaginationWidgetDot.tsx` | 21 | да |
| 84 | `src/components/Carousel/client/modules/Pagination/widget/defaults.ts` | 13 | да |
| 85 | `src/components/Carousel/client/modules/Pagination/widget/index.ts` | 5 | да |
| 86 | `src/components/Carousel/client/modules/Pagination/widget/math/projection.ts` | 86 | да |
| 87 | `src/components/Carousel/client/modules/Pagination/widget/math/spatialField.ts` | 53 | да |
| 88 | `src/components/Carousel/client/modules/Pagination/widget/math/trajectory.ts` | 85 | да |
| 89 | `src/components/Carousel/client/modules/Pagination/widget/stepTarget.ts` | 59 | да |
| 90 | `src/components/Carousel/client/modules/Pagination/widget/types.ts` | 46 | да |
| 91 | `src/components/Carousel/client/modules/Pagination/widget/usePaginationWidgetBinding.ts` | 593 | да |
| 92 | `src/components/Carousel/client/modules/ResponsiveImages/ResponsiveImages.tsx` | 110 | да |
| 93 | `src/components/Carousel/client/modules/ResponsiveImages/index.ts` | 2 | да |
| 94 | `src/components/Carousel/client/modules/ResponsiveImages/types.ts` | 5 | да |
| 95 | `src/components/Carousel/client/modules/index.ts` | 12 | да |
| 96 | `src/components/Carousel/client/motion/duration.ts` | 67 | да |
| 97 | `src/components/Carousel/client/motion/index.ts` | 25 | да |
| 98 | `src/components/Carousel/client/motion/planChannel.ts` | 103 | да |
| 99 | `src/components/Carousel/client/motion/sampler.ts` | 5 | да |
| 100 | `src/components/Carousel/client/motion/segmentFactory.ts` | 376 | да |
| 101 | `src/components/Carousel/client/motion/speed.ts` | 8 | да |
| 102 | `src/components/Carousel/client/motion/timing.ts` | 136 | да |
| 103 | `src/components/Carousel/client/motion/tolerances.ts` | 3 | да |
| 104 | `src/components/Carousel/client/motion/types.ts` | 32 | да |
| 105 | `src/components/Carousel/client/motion/useCarouselMotionExecution.ts` | 25 | да |
| 106 | `src/components/Carousel/client/motion/useMotionRunner.ts` | 304 | да |
| 107 | `src/components/Carousel/client/navigation/index.ts` | 2 | да |
| 108 | `src/components/Carousel/client/navigation/useCarouselNavigation.ts` | 84 | да |
| 109 | `src/components/Carousel/client/presentation/cssVars.ts` | 36 | да |
| 110 | `src/components/Carousel/client/presentation/domPayload.ts` | 21 | да |
| 111 | `src/components/Carousel/client/presentation/index.ts` | 5 | да |
| 112 | `src/components/Carousel/client/presentation/useCarouselPresentation.ts` | 88 | да |
| 113 | `src/components/Carousel/client/public-api/index.ts` | 20 | да |
| 114 | `src/components/Carousel/client/public-api/schemas.ts` | 45 | да |
| 115 | `src/components/Carousel/client/public-api/types.ts` | 91 | да |
| 116 | `src/components/Carousel/client/render-policy/useModuleRenderPolicy.ts` | 79 | да |
| 117 | `src/components/Carousel/client/slides/SlideItem.tsx` | 147 | да |
| 118 | `src/components/Carousel/client/slides/SlideItem.types.ts` | 29 | да |
| 119 | `src/components/Carousel/client/slides/imageResource/createImageResourceStore.ts` | 147 | да |
| 120 | `src/components/Carousel/client/slides/imageResource/index.ts` | 9 | да |
| 121 | `src/components/Carousel/client/slides/imageResource/types.ts` | 26 | да |
| 122 | `src/components/Carousel/client/slides/imageResource/useImageResource.ts` | 76 | да |
| 123 | `src/components/Carousel/client/slides/imageResource/useImageResourceRetention.ts` | 47 | да |
| 124 | `src/components/Carousel/client/slides/imageResource/useImageResourceStore.ts` | 23 | да |
| 125 | `src/components/Carousel/client/slides/imageResource/useImageResourceStoreInstance.ts` | 31 | да |
| 126 | `src/components/Carousel/client/slides/index.ts` | 11 | да |
| 127 | `src/components/Carousel/client/slides/useActiveBandGate.ts` | 76 | да |
| 128 | `src/components/Carousel/client/slides/useCarouselSlideDeck.ts` | 66 | да |
| 129 | `src/components/Carousel/client/slides/useOrientationSwapVeil.ts` | 79 | да |
| 130 | `src/components/Carousel/client/slides/useSlideRenderModel.ts` | 163 | да |
| 131 | `src/components/Carousel/client/slots/index.ts` | 2 | да |
| 132 | `src/components/Carousel/client/slots/slotNames.ts` | 16 | да |
| 133 | `src/components/Carousel/client/state/index.ts` | 9 | да |
| 134 | `src/components/Carousel/client/state/initial.ts` | 23 | да |
| 135 | `src/components/Carousel/client/state/reconcile.ts` | 54 | да |
| 136 | `src/components/Carousel/client/state/reducer.ts` | 236 | да |
| 137 | `src/components/Carousel/client/state/transitions.ts` | 154 | да |
| 138 | `src/components/Carousel/client/state/types.ts` | 120 | да |
| 139 | `src/components/Carousel/client/state/useCarouselState.ts` | 65 | да |
| 140 | `src/components/Carousel/client/state/validateState.ts` | 76 | да |
| 141 | `src/components/Carousel/client/viewport/useSlideViewport.ts` | 6 | да |
| 142 | `src/components/Carousel/client/visual-position/fallbackPacing.ts` | 10 | да |
| 143 | `src/components/Carousel/client/visual-position/index.ts` | 7 | да |
| 144 | `src/components/Carousel/client/visual-position/types.ts` | 29 | да |
| 145 | `src/components/Carousel/client/visual-position/useVisualPosition.ts` | 139 | да |
| 146 | `src/components/Carousel/data-gen/buildSlide.ts` | 82 | да |
| 147 | `src/components/Carousel/data-gen/cli.ts` | 31 | да |
| 148 | `src/components/Carousel/data-gen/generateSlides.ts` | 103 | да |
| 149 | `src/components/Carousel/data-gen/index.ts` | 35 | да |
| 150 | `src/components/Carousel/data-gen/runDataGen.ts` | 143 | да |
| 151 | `src/components/Carousel/data-gen/types.ts` | 36 | да |
| 152 | `src/globals.scss` | 136 | да |
| 153 | `src/main.tsx` | 19 | да |
| 154 | `src/shared/clientState/environment/index.ts` | 3 | да |
| 155 | `src/shared/clientState/environment/library/index.ts` | 4 | да |
| 156 | `src/shared/clientState/environment/library/useDataSaver.ts` | 89 | да |
| 157 | `src/shared/clientState/environment/library/useIsReducedMotion.ts` | 5 | да |
| 158 | `src/shared/clientState/environment/library/useIsTouchDevice.ts` | 73 | да |
| 159 | `src/shared/clientState/environment/useUserEnvironment/index.ts` | 3 | да |
| 160 | `src/shared/clientState/environment/useUserEnvironment/internal/useDataSaver.ts` | 89 | да |
| 161 | `src/shared/clientState/environment/useUserEnvironment/internal/useIsReducedMotion.ts` | 5 | да |
| 162 | `src/shared/clientState/environment/useUserEnvironment/internal/useIsTouchDevice.ts` | 73 | да |
| 163 | `src/shared/clientState/environment/useUserEnvironment/useUserEnvironment.ts` | 24 | да |
| 164 | `src/shared/clientState/index.ts` | 4 | да |
| 165 | `src/shared/clientState/media/index.ts` | 3 | да |
| 166 | `src/shared/clientState/media/library/index.ts` | 19 | да |
| 167 | `src/shared/clientState/media/library/useBreakpoint.ts` | 66 | да |
| 168 | `src/shared/clientState/media/library/useOrientation.ts` | 15 | да |
| 169 | `src/shared/clientState/media/library/useShortLandscape.ts` | 9 | да |
| 170 | `src/shared/clientState/media/useMedia/index.ts` | 5 | да |
| 171 | `src/shared/clientState/media/useMedia/internal/canonicalMedia.ts` | 28 | да |
| 172 | `src/shared/clientState/media/useMedia/internal/resolveActiveBreakpoint.ts` | 35 | да |
| 173 | `src/shared/clientState/media/useMedia/internal/useOrientation.ts` | 15 | да |
| 174 | `src/shared/clientState/media/useMedia/useMedia.ts` | 60 | да |
| 175 | `src/shared/clientState/shared/index.ts` | 2 | да |
| 176 | `src/shared/clientState/shared/useMediaQuery.ts` | 78 | да |
| 177 | `src/shared/engines/gesture/index.ts` | 40 | да |
| 178 | `src/shared/engines/gesture/inertia/inertialRelease.ts` | 41 | да |
| 179 | `src/shared/engines/gesture/inertia/releaseKinetics.ts` | 106 | да |
| 180 | `src/shared/engines/gesture/inertia/releaseLaunch.ts` | 51 | да |
| 181 | `src/shared/engines/gesture/inertia/speed.ts` | 9 | да |
| 182 | `src/shared/engines/gesture/swipe/internals/index.ts` | 16 | да |
| 183 | `src/shared/engines/gesture/swipe/internals/interactiveTarget.ts` | 46 | да |
| 184 | `src/shared/engines/gesture/swipe/internals/math.ts` | 67 | да |
| 185 | `src/shared/engines/gesture/swipe/internals/resolveSwipeDirection.ts` | 65 | да |
| 186 | `src/shared/engines/gesture/swipe/types.ts` | 123 | да |
| 187 | `src/shared/engines/gesture/swipe/usePointerSwipe.ts` | 612 | да |
| 188 | `src/shared/engines/kinetic/index.ts` | 11 | да |
| 189 | `src/shared/engines/kinetic/internal/defaults.ts` | 15 | да |
| 190 | `src/shared/engines/kinetic/internal/gesture/index.ts` | 28 | да |
| 191 | `src/shared/engines/kinetic/internal/gesture/inertia/inertialRelease.ts` | 41 | да (полный diff против прочитанного оригинала: расхождения только в комментариях) |
| 192 | `src/shared/engines/kinetic/internal/gesture/inertia/releaseLaunch.ts` | 51 | да (полный diff против прочитанного оригинала: расхождения только в комментариях) |
| 193 | `src/shared/engines/kinetic/internal/gesture/inertia/speed.ts` | 9 | да (полный diff против прочитанного оригинала: расхождения только в комментариях) |
| 194 | `src/shared/engines/kinetic/internal/gesture/swipe/internals/index.ts` | 16 | да (полный diff против прочитанного оригинала: расхождения только в комментариях) |
| 195 | `src/shared/engines/kinetic/internal/gesture/swipe/internals/interactiveTarget.ts` | 46 | да (полный diff против прочитанного оригинала: расхождения только в комментариях) |
| 196 | `src/shared/engines/kinetic/internal/gesture/swipe/internals/math.ts` | 67 | да (полный diff против прочитанного оригинала: расхождения только в комментариях) |
| 197 | `src/shared/engines/kinetic/internal/gesture/swipe/internals/resolveSwipeDirection.ts` | 65 | да (полный diff против прочитанного оригинала: расхождения только в комментариях) |
| 198 | `src/shared/engines/kinetic/internal/gesture/swipe/types.ts` | 123 | да (полный diff против прочитанного оригинала: расхождения только в комментариях) |
| 199 | `src/shared/engines/kinetic/internal/gesture/swipe/usePointerSwipe.ts` | 612 | да (полный diff против прочитанного оригинала: расхождения только в комментариях) |
| 200 | `src/shared/engines/kinetic/internal/motion/compositor/compositedRide.ts` | 142 | да |
| 201 | `src/shared/engines/kinetic/internal/motion/compositor/pinnedAnimation.ts` | 30 | да (полный diff против прочитанного оригинала: расхождения только в комментариях) |
| 202 | `src/shared/engines/kinetic/internal/motion/index.ts` | 56 | да |
| 203 | `src/shared/engines/kinetic/internal/motion/profile/clamp.ts` | 3 | да (полный diff против прочитанного оригинала: расхождения только в комментариях) |
| 204 | `src/shared/engines/kinetic/internal/motion/profile/profile.ts` | 187 | да (полный diff против прочитанного оригинала: расхождения только в комментариях) |
| 205 | `src/shared/engines/kinetic/internal/motion/profile/profileSegment.ts` | 82 | да (полный diff против прочитанного оригинала: расхождения только в комментариях) |
| 206 | `src/shared/engines/kinetic/internal/motion/profile/progressCurve.ts` | 169 | да (полный diff против прочитанного оригинала: расхождения только в комментариях) |
| 207 | `src/shared/engines/kinetic/internal/motion/runtime/clock.ts` | 4 | да (полный diff против прочитанного оригинала: расхождения только в комментариях) |
| 208 | `src/shared/engines/kinetic/internal/motion/runtime/createMotionController.ts` | 292 | да (полный diff против прочитанного оригинала: расхождения только в комментариях) |
| 209 | `src/shared/engines/kinetic/internal/motion/runtime/types.ts` | 98 | да (полный diff против прочитанного оригинала: расхождения только в комментариях) |
| 210 | `src/shared/engines/kinetic/internal/motion/runtime/useMotionController.ts` | 21 | да (полный diff против прочитанного оригинала: расхождения только в комментариях) |
| 211 | `src/shared/engines/kinetic/internal/motion/runtime/useMotionPaint.ts` | 19 | да (полный diff против прочитанного оригинала: расхождения только в комментариях) |
| 212 | `src/shared/engines/kinetic/internal/types.ts` | 62 | да |
| 213 | `src/shared/engines/kinetic/useKineticValue.ts` | 163 | да |
| 214 | `src/shared/engines/motion/compositor/compositedRide.ts` | 280 | да |
| 215 | `src/shared/engines/motion/compositor/pinnedAnimation.ts` | 30 | да |
| 216 | `src/shared/engines/motion/index.ts` | 59 | да |
| 217 | `src/shared/engines/motion/profile/clamp.ts` | 3 | да |
| 218 | `src/shared/engines/motion/profile/profile.ts` | 187 | да |
| 219 | `src/shared/engines/motion/profile/profileSegment.ts` | 82 | да |
| 220 | `src/shared/engines/motion/profile/progressCurve.ts` | 169 | да |
| 221 | `src/shared/engines/motion/runtime/clock.ts` | 4 | да |
| 222 | `src/shared/engines/motion/runtime/createMotionController.ts` | 292 | да |
| 223 | `src/shared/engines/motion/runtime/types.ts` | 98 | да |
| 224 | `src/shared/engines/motion/runtime/useMotionController.ts` | 21 | да |
| 225 | `src/shared/engines/motion/runtime/useMotionPaint.ts` | 19 | да |
| 226 | `src/shared/focus/manageFocusShift.ts` | 35 | да |
| 227 | `src/shared/hooks/useIsomorphicLayoutEffect.ts` | 4 | да |
| 228 | `src/shared/icons/ChevronIcon.tsx` | 33 | да |
| 229 | `src/shared/index.ts` | 16 | да |
| 230 | `src/shared/math/numeric.ts` | 36 | да |
| 231 | `src/shared/slots/resolveSlots.ts` | 41 | да |
| 232 | `src/shared/styles/mergeStyleMaps.ts` | 19 | да |
| 233 | `src/shared/theme/ThemeProvider.tsx` | 14 | да |
| 234 | `src/shared/theme/ThemeStateProvider.tsx` | 65 | да |
| 235 | `src/shared/theme/colors.ts` | 8 | да |
| 236 | `src/shared/theme/index.ts` | 11 | да |
| 237 | `src/shared/theme/internal/BrowserChromeSync.tsx` | 51 | да |
| 238 | `src/shared/theme/internal/ThemeContext.ts` | 4 | да |
| 239 | `src/shared/theme/internal/constants.ts` | 13 | да |
| 240 | `src/shared/theme/internal/resolve.ts` | 26 | да |
| 241 | `src/shared/theme/internal/storage.ts` | 20 | да |
| 242 | `src/shared/theme/internal/types.ts` | 12 | да |
| 243 | `src/shared/theme/useTheme.ts` | 8 | да |
| 244 | `src/shared/viewportObservation/index.ts` | 3 | да |
| 245 | `src/shared/viewportObservation/useIsomorphicLayoutEffect.ts` | 6 | да |
| 246 | `src/shared/viewportObservation/useViewportBusy.ts` | 64 | да |
| 247 | `src/shared/viewportObservation/useViewportVisibility.ts` | 55 | да |
| 248 | `src/vite-env.d.ts` | 1 | да |
