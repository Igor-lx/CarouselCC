# Карта кодовой базы — фаза 1

Прочитано 100% `.ts/.tsx/.scss/.json/.html` (318 файлов, ~23.4k строк), включая тесты.
Baseline: `npm run typecheck` — OK; `npm test` — 68 файлов / 495 тестов, все зелёные.

Формат записи: `путь` — экспорты · ответственность · состояние · эффекты · инварианты · подозрения(`file:line`).

Продолжение по shared/ — в [`01-map-shared.md`](./01-map-shared.md).
Находки — в [`02-findings.md`](./02-findings.md).

---

## 0. Стенд и сборка

- `index.html` — pre-paint boot-скрипт темы (дублирует `THEME_STORAGE_KEY` и цвета, дрейф ловит `bootSync.test.ts`). ⚠ `index.html:19` `maximum-scale=1.0, user-scalable=no` — блок pinch-zoom (a11y, WCAG 1.4.4); это стенд.
- `src/main.tsx` — StrictMode + ThemeProvider + App. Бросает при отсутствии `#root`.
- `src/app/App.tsx` — тестовый стенд. Читает `useUserEnvironment()` и `useMedia(SLIDE_VIEWPORT_AXES)` ОДИН раз на границе и прокидывает в компонент. `App.tsx:33-40` выбор набора слайдов из `?slides=`. `App.tsx:114-132` fetch данных без валидации (осознанно, см. коммент). ⚠ `App.tsx:61` `window.open(..., "_blank")` без `noopener`.
- `src/app/App.module.scss` — стенд; `svh` вместо `dvh` (коммент объясняет), safe-area insets. Медиазапросы только у стенда.
- `src/globals.scss` — `@layer reset, baseStyles, components;` + токены темы в `:root` / `[data-theme="dark"]`.
- `package.json` — react 19.1, zod 4, vite 8, vitest 4, ts 6. `@types/node` закреплён на 24 (см. память проекта).
- `tsconfig.json` — solution-style, `files: []` (ловушка описана прямо в файле). `tsconfig.app.json` — `strict`, `noUnusedLocals/Parameters`, `erasableSyntaxOnly`. ⚠ НЕТ `noUncheckedIndexedAccess` и `exactOptionalPropertyTypes`, хотя код всюду написан в их стиле (`records[i]!`, `...(x !== undefined && {k:x})`).
- `vite.config.ts` / `vitest.config.ts` — раздельные; coverage исключает все `.tsx` компонента.
- `carousel-data.config{1,2}.json` — конфиги генератора; `<source media>` в них сверяется с осями (`orientationMediaSync.test.ts`).

---

## 1. `client/` — публичный контракт

- `public-api/types.ts` — `CarouselProps`, `Slide`, `CarouselHandle`, `CarouselStatusSnapshot`, `UserEnvironment`, `ClassNameMap`, `SLIDE_CLASS_KEYS`. Типы `Slide*` выведены из zod-схем. `ref` как проп (React 19).
- `public-api/schemas.ts` — zod-схемы; НЕ реэкспортируются из бочки, чтобы zod не попал в бандл (host делает deep-import). `ReactElementSchema` проверяет оба `$$typeof`-сигила.
- `public-api/index.ts` — бочка типов; комментарий фиксирует причину отсутствия схем.
- `index.ts` — `default` + типы.

**Инвариант:** идентичность слайда = `id` + `content`; `image` — render-only и НЕ входит в `dataKey` (проверено `reconcile.test.ts:102-139`).

---

## 2. `client/config/` — резолв настроек

- `types.ts` — все интерфейсы настроек. `CarouselSwipeConfig = Omit<Required<PointerSwipeConfig>, "minSwipeDistance"|"swipeThresholdRatio"> & {commit}`.
- `defaults.ts` / `motion.ts` / `gesture.ts` / `interaction.ts` / `layout.ts` / `legacyPaint.ts` / `slides.ts` — плоские константы-тюнинги.
- `viewport.ts` — `SLIDE_VIEWPORT_BREAKPOINTS/FLAGS/AXES` + `SLIDE_CANONICAL_SOURCE_MEDIA` (выводится из осей).
- `resolve/buildConfig.ts` — чистая сборка `CarouselRuntimeConfig`. `useDefault` подставляет дефолт ТОЛЬКО для `undefined`; никакой нормализации (ADR-002).
- `resolve/useCarouselConfig.ts` — `useMemo` по 5 пропам.
- `index.ts` — бочка.

**Инвариант:** конфиг никогда не чинит явно переданное значение; кривое значение — забота Diagnostic.

---

## 3. `client/domain/` — чистые функции (без React)

- `math.ts` — `mod` (защищён от total<=0), `clamp`, `normalizePageIndex`.
- `types.ts` — `CarouselLayout`, `CarouselSlideRecord`, `VirtualSlide`, `RenderWindow`, `SlideAriaProps`.
- `slides.ts` — `buildSlideRecords`, `padDeckToFullPage`, `clampedVisibleSlidesCount` (тихая коэрция), `resolveLargestSrcSetCandidate/ImageCandidate`, `resolveRenderedImageSrc` (одно правило для рендера и retention), `deckCarriesImageSets`.
- `layout.ts` — `buildCarouselLayout` (+`dataKey` из slideKey+contentKey), `alignedVirtualIndex` (полоса цикла), `pageContaining` (floor) vs `nearestPageIndex` (round), `carouselBoundaryState` (в cyclic всегда false), `reconciledPageIndex` (пропорциональный ремап), `loopedSlideIndex`.
- `renderWindow.ts` — `buildRenderWindow` (буфер = visible×multiplier; finite клампится, cyclic — нет), `buildSegmentWindow`, `windowContains`, `expandWindow`.
- `visibility.ts` — `slideVisibilityFlags` (isActual = в полосе; isActive также держит слайды старта сегмента — фикс инертной левой карточки), `buildSlideAriaProps`.
- `track.ts` — `trackPixelTransform` (округление до 1e-4), `trackCssTransform` (до-измерительный фолбэк), `slideLane`, `measureSlotSize` (`(width+gap)/visible`, читает `--slides-gap`), `pointerVelocityToVirtual`.
- `dragRelease.ts` — `DRAG_RELEASE_EPSILON`, `resolveDragRelease` (in-flight-grab → посадка на прижатую страницу).
- `index.ts` — бочка (реэкспорт по именам, не `*` для slides/layout/track).

---

## 4. `client/state/` — редьюсер

- `types.ts` — `CarouselState`, команды `MOVE|GO_TO|START_DRAG|END_DRAG|MOTION_SETTLED`, `ReducerEnvelope` (context внутрь команды).
- `initial.ts` — `buildInitialState`, `motionStatus`.
- `reconcile.ts` — `sameLayout` по 4 полям; hardReset при смене `dataKey`/`isFinite`; иначе пропорциональный ремап + `step-instant`.
- `reducer.ts` — сверка с layout на границе каждой команды (ADR-001). `MOTION_SETTLED` отличает свежий settle от устаревшего по `settledPosition` vs `virtualIndex` (эпсилон).
- `transitions.ts` — `resolveStepTransition` (`stepOrigin` для повторного клика считает ВИЗУАЛЬНУЮ страницу floor/ceil по направлению), `isSameDirectionRepeat`, `hasReachedDragTarget`.
- `useCarouselState.ts` — `useReducer` + `reconcileStateToLayout` поверх закоммиченного состояния; ref-и обновляются в рендере ради стабильного `dispatch`.
- `validateState.ts` — чистый валидатор структурных инвариантов; редьюсер его не читает, читает только Diagnostic.

**Инварианты:** `teleportVirtualIndex !== null` ⇒ `motionPhase === "step-jump"`; `isTeleportApproach` ⇒ то же; `0 <= targetPageIndex < pageCount`.

---

## 5. `client/motion/` — семантика движения

- `tolerances.ts` — `MOTION_EPSILON = 1e-4`.
- `timing.ts` — SSOT геометрии GO_TO: `resolveGoToProfileZones`, `resolveGoToPlan` (телепорт только если есть НИ РАЗУ не показанная промежуточная страница), `resolveGoToApproach/Preflight/FlightDuration`.
- `duration.ts` — `durationByVirtualSpan`, `resolveStepDuration` (только для duration-authored шагов).
- `speed.ts` — реэкспорт `alignSpeed as sameDirectionSpeed` (из motion-движка, НЕ из gesture) + `signedVelocity`. ⚠ имя совпадает с другим экспортом shared.
- `types.ts` — `CarouselMotionStrategy/Intent`, `CarouselSegment`, `MotionStart`.
- `segmentFactory.ts` — `intentFromState` → одна из 5 стратегий профиля; `buildGestureProfile` (continuity launch + пол длительности), `buildGoToProfile` (+ потолок по flight-envelope), `buildRepeatedProfile`, `buildStepProfile`.
- `sampler.ts` — алиас движкового сэмплера.
- `planChannel.ts` — обычная observable (без React); дедуп повторных `idle` и одинаковых `follow`.
- `useMotionRunner.ts` — единственный мост «состояние → контроллер». ⚠ `useMotionRunner.ts:80-93` строка-ключ и `:269-289` массив зависимостей — два независимых списка полей, которые обязаны совпадать (в ключе нет `layout.visibleSlidesCount`, в зависимостях есть).
- `useCarouselMotionExecution.ts` — тонкая обёртка, подставляет `onSettle`.
- `index.ts` — бочка + реэкспорт WAAPI-примитивов движка.

---

## 6. `client/visual-position/` — SSOT видимой позиции

- `useVisualPosition.ts` — оборачивает один `MotionController`; `runningFrameIndex` штампуется в единственном месте; `sampleNow()` = `captureHandoff().position` (без reflow).
- `types.ts` — `VisualPositionFrame/Source`.
- `fallbackPacing.ts` — `isDroppedFallbackFrame` — ОДНО правило пропуска кадров для трека, точек и виджета.

---

## 7. `client/geometry/` — измерения и трек

- `useTrackBinding.ts` — запись transform, WAAPI-поездка, `syncGeometry`, ResizeObserver+resize. ⚠ `:244-275` третий (по счёту в компоненте) ResizeObserver на одном и том же viewport.
- `useMeasuredSlotSize.ts` — `useState` + свой ResizeObserver + свой `resize`-listener; ОКРУГЛЯЕТ до целых px, эпсилон 1px. ⚠ инстанцируется дважды (см. находки).
- `useResponsiveImageSizes.ts` — px или `vw`-фолбэк до первого измерения.

---

## 8. `client/gesture/`

- `useCarouselGesture.ts` — press-commit deferral (START_DRAG уходит в отдельную задачу, `flushPendingStart` гарантирует порядок), `pressedPageIndex` из press-X, `contextMenuSeen` (меню vs скролл), эффект-сирота на `!canSlide || !isSwipeOn`. ⚠ `:133` `dispatch` в зависимостях `startDragFromCurrentPosition`, но не используется.
- `coast.ts` — `resolveCoastedLaunchPosition` + `GESTURE_COAST_MAX_MS`.
- `slotAdaptiveSwipe.ts` — перевод «долей слота» в абсолютные px движка; `SWIPE_REFERENCE_SLOT_PX = 400` — калибровочная ЗАПИСЬ, не ручка.

---

## 9. `client/` — прочие слои

- `navigation/useCarouselNavigation.ts` — `move`/`goTo` читают живую позицию через `readCurrentPosition()` и кладут её в `fromVirtualIndex`.
- `autoplay/useAutoplay.ts` — обобщённый цикл; отложенный тик перевзводит ПОЛНЫЙ интервал (документировано как намеренное).
- `autoplay/useCarouselAutoplay.ts` — адаптер: visibility + motion + viewport-quiet.
- `focus/useFocusRecovery.ts` — layout-effect, срабатывает на переход в idle или смену страницы.
- `host-report/` — `statusSnapshot.ts` (shallow eq) + `useCarouselStatusReporter.ts` (дедуп).
- `render-policy/useModuleRenderPolicy.ts` — единственный владелец гейтов слотов; Diagnostic только в DEV.
- `presentation/` — `cssVars.ts` (контракт JS→CSS), `domPayload.ts`, `useCarouselPresentation.ts` (кэш lane-стилей по virtualIndex — держит `style` референциально стабильным между двумя перестройками `virtualSlides` за поездку).
- `viewport/useSlideViewport.ts` — одна строка: `useMedia(SLIDE_VIEWPORT_AXES)`.
- `slots/slotNames.ts` — `CAROUSEL_SLOTS` + `CarouselSlotComponent`.
- `context/` — два контекста по частоте обновления (`Stable` / `Motion`) + `Diagnostic`; в проде диагностический контекст — замороженная пустышка.
- `areCarouselPropsEqual.ts` — структурное сравнение inline-JSX детей. ⚠ рекурсия по `children` не ограничена по глубине.
- `Carousel.tsx` — композиционный корень, без бизнес-логики. ⚠ `:132` переменная `useMemoDeckCarriesImageSets` названа как хук. ⚠ `:87-88` лишние пустые строки.
- `Carousel.module.scss` — `@layer baseStyles`; геометрия по data-атрибутам, без `@media`; `img[data-reorienting="true"] { opacity: 0 }`.

---

## 10. `client/slides/`

- `useCarouselSlideDeck.ts` — записи + layout + `perfectPageLayoutInfo`.
- `useSlideRenderModel.ts` — окно рендера (расширяется в движении, сжимается на settle), `layoutOrigin` (ребазируется раз в `LAYOUT_ORIGIN_BAND_SLOTS=512`), кэш `VirtualSlide` по virtualIndex. ⚠ `:69-80` мутация ref внутри `useMemo`.
- `SlideItem.tsx` — единственный рендер слайда; `inert` вне активной полосы; `<picture>`/`srcSet` под гейтом модуля; ключ `generation` для ретрая.
- `useOrientationSwapVeil.ts` — вуаль на смену `signature`. ⚠ **BUG** — см. находку F1.
- `useActiveBandGate.ts` — двухволновая загрузка; URL-ы полосы стабилизированы ПО СОДЕРЖИМОМУ, защёлка на первый исход.
- `imageResource/` — `createImageResourceStore.ts` (status+generation+backoff+prune+soft dispose), `useImageResource.ts` (`useSyncExternalStore`), `useImageResourceStore(Instance|Retention).ts`.

---

## 11. `client/modules/`

- `Controls/` — две краевые зоны; в cyclic обе всегда видны (isAtStart/isAtEnd = false).
- `Pagination/basic/` — `Pagination.tsx` (обёртка `aria-hidden`, точки `tabIndex=-1` — осознанно, индикация страницы идёт через `aria-current` полосы), `PaginationDot.tsx` (button/div по флагу), `fadeKeyframes.ts` (чистая математика вида точки), `usePaginationFade.ts` (три режима: waapi / follow / rest; владение inline-слоем и подавление transition берутся и отдаются вместе).
- `Pagination/widget/` — `PaginationWidget.tsx`, `usePaginationWidgetBinding.ts` (несвязанный счётчик шагов), `stepTarget.ts`, `math/spatialField|projection|trajectory.ts`, `defaults.ts`. ⚠ **см. находку F2** (покрытие точек/оверлеев фиксировано, а цепочка шагов — нет). ⚠ `PaginationWidgetDot.tsx:9` `forwardRef` (deprecated в React 19) при ref-as-prop во всём остальном коде. ⚠ `PaginationWidget.module.scss` — единственный `.module.scss` компонента БЕЗ `@layer`.
- `ResponsiveImages/` — headless: presence-switch + idle-predecode на detached `Image`.
- `Diagnostic/` — `Diagnostic.tsx` + `checks/` (constant/prop/layout/slot/state/viewport/widget) + `formatter.ts` + `useGroupedWarnings.ts`. Весь код за `import.meta.env.DEV`, правила строятся по требованию (не на уровне модуля), чтобы не пережить tree-shaking.

---

## 12. `data-gen/`

- `types.ts` — локальный `GeneratedSlide` (осознанно не импортирует компонент).
- `buildSlide.ts` — соглашения одного слайда (наименьший кандидат = fallback, `w`-дескрипторы, `sizes` не пишется).
- `generateSlides.ts` — чистое ядро, идемпотентный merge по slug (сохраняет `id` и ручной `alt`).
- `runDataGen.ts` — единственный файл, трогающий диск.
- `cli.ts` — `tsx cli.ts <config.json>`.

## 13. `boundary/`

- `boundaries.test.ts` — `client/` не импортирует `data-gen/`; `data-gen/` не выходит за свою папку; есть guard от вакуумного прохода.
- `slide-contract.test.ts` — компайл-тайм проверка `GeneratedSlide → Slide`.
