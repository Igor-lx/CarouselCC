# Карта `src/shared/` — фаза 1

Полка заготовок. Правило полки (`shared/README.md`): каждая заготовка держит свои копии
хуков; единственное, что НИКОГДА не дублируется — стор (`clientState/shared/useMediaQuery.ts`,
гарантируется `singleStore.test.ts`).

- `index.ts` — `export *` из clientState / viewportObservation / engines{motion,kinetic,gesture} + точечные.
  Проверено: коллизий имён между тремя бочками движков НЕТ.

## engines/motion (эталон)

- `runtime/clock.ts` — `motionNow()`, единственный домен времени.
- `runtime/types.ts` — `MotionController` (ключевое различие `captureHandoff` vs `getSnapshot`), `MotionStartOptions.isPassive`.
- `runtime/createMotionController.ts` — фрейм-луп, пассивный режим (один `setTimeout` на конец сегмента вместо rAF), `wake()`, мягкий `destroy()`.
- `runtime/useMotionController.ts` / `useMotionPaint.ts` — React-обёртки.
- `profile/clamp.ts` — локальная копия по замыслу.
- `profile/profile.ts` — зоны accel/cruise/decel; smoothstep + его интеграл; доли берутся КАК ЕСТЬ (переаллокация → отрицательный cruise, зона пропускается).
- `profile/profileSegment.ts` — `sampleProfileSegment`, `alignSpeed`, `createProfileSegment`.
- `profile/progressCurve.ts` — плотность стопов выводится из формы профиля (относительный шаг скорости ~5%, кламп [32,256]); `sampleProgressStops`, `resampleStops`, `resolvePeakSpeedForDuration` (квадратный корень), `positionAtNow`, `keyframesAlongStops`, `isWaapiSupported` (кэш).
- `compositor/pinnedAnimation.ts` — `element.animate(kf, {fill:"both"})` + `startTime = startedAt`, оба в try/catch → `null` = JS-фолбэк.
- `compositor/compositedRide.ts` — turnkey «один контроллер → один элемент»; `flyTo`, `dragBinding`, `cancel` пинит ДО `cancel()` и будит контроллер.
- `tests/` — 9 файлов, включая `portability.test.ts` (react+себя).

## engines/gesture

- `swipe/usePointerSwipe.ts` — движок распознавания. ТОЛЬКО touch-указатели (`:422`, документировано в README как принцип). Всё состояние в ref-ах, нуль ре-рендеров. Ключевые механизмы: окно «поимки» (`catchDelayMs`), часы по `event.timeStamp`, визуальный ре-якорь `visualStartX`, `launchVelocity` на «медленном законе» с pause-защитой.
- `swipe/internals/math.ts` — `applyResistance`, EMA c поправкой на длину кадра, `pauseDecayedVelocity`, `dominantMagnitude`.
- `swipe/internals/resolveSwipeDirection.ts` — коммит: быстрый флик ИЛИ дистанция с поправкой на сопротивление. ⚠ **см. находку F3**: в ветке флика направление берётся из знака СМЕЩЕНИЯ, а не из знака скорости.
- `swipe/internals/interactiveTarget.ts` — `data-drag-ignore` + список интерактивных селекторов.
- `inertia/inertialRelease.ts` — суждение о флике (читает палец, не UI).
- `inertia/releaseLaunch.ts` — continuity launch (старт = то, что видел глаз).
- `inertia/releaseKinetics.ts` — фасад над двумя примитивами + `projectMomentum`.
- `inertia/speed.ts` — `sameDirectionSpeed` (локальная копия `alignSpeed`).
- `tests/` — 7 файлов, включая portability и surface-контракт.

## engines/kinetic

- `useKineticValue.ts` — фасад: gesture + motion в одном хуке.
- `internal/gesture/**`, `internal/motion/**` — ФОРКИ. Сверено побайтово: все файлы идентичны оригиналам, кроме путей в doc-комментариях. Единственное содержательное отличие — `internal/motion/compositor/compositedRide.ts`: намеренно урезанный форк (нет `flyTo`/`dragBinding`/`useMotionPaint`), 126 стр. против 254.
- `internal/defaults.ts`, `internal/types.ts` — свои.
- `tests/` — portability + surfacePassthrough + useKineticValue.

## clientState

- `shared/useMediaQuery.ts` — ЕДИНСТВЕННЫЙ стор проекта: один `MediaQueryList` и один listener на строку запроса, счётчик подписчиков, «дремота» с пере-синком. Ленивое живое чтение в `getSnapshot` (регрессия «первый кадр = false» закрыта тестами).
- `media/useMedia/useMedia.ts` — фасад: N хуков в цикле, контракт «axes — статическая константа модуля». Возвращает `{breakpoint, orientation, flags, matches, signature}`, мемо по `signature`.
- `media/useMedia/internal/{canonicalMedia,resolveActiveBreakpoint,useOrientation}.ts` — вывод канонических медиастрок из ЧИСЕЛ таблицы.
- `media/library/{useBreakpoint,useOrientation,useShortLandscape}.ts` — форк-двойники (сверено: отличаются только глубиной импорта стора).
- `environment/useUserEnvironment/**` + `environment/library/**` — то же: `useIsTouchDevice` (coarse-pointer + однократный pointerdown-фолбэк), `useDataSaver` (media + `navigator.connection`), `useIsReducedMotion`. Форки идентичны.

## viewportObservation

- `useViewportBusy.ts` — ГЕТТЕР (не реактивный флаг): пальцы + скролл/resize/visualViewport, окно само продлевается.
- `useViewportVisibility.ts` — IntersectionObserver + `visibilitychange`.
- `useIsomorphicLayoutEffect.ts` — дремлющая локальная копия (репозиторий импортирует общую; `singleSource.test.ts` это стережёт).

## theme / focus / slots / styles / icons / math / hooks

- `theme/` — `ThemeStateProvider` (состояние + `data-theme` + storage-синк между вкладками), `internal/BrowserChromeSync.tsx` (inline-фон `<html>` + `theme-color`), `internal/{constants,resolve,storage,types,ThemeContext}.ts`, `colors.ts`. Дрейф с `index.html` стережёт `bootSync.test.ts`.
- `focus/manageFocusShift.ts` — вывод фокуса из `inert`-поддерева в активную зону.
- `slots/resolveSlots.ts` — `Children.forEach` + статик `slot`; dev-предупреждения на неизвестный/дублирующий слот.
- `styles/mergeStyleMaps.ts` — конкатенация классов по ключам.
- `icons/ChevronIcon.tsx` — inline SVG, поворот через `transform`.
- `math/numeric.ts` — набор type-guard'ов (`value is number`), каждый подразумевает конечность. Именно поэтому цепочки вида `atLeast(0)(v) && v < 400` в Diagnostic типизируются.
- `hooks/useIsomorphicLayoutEffect.ts` — общая копия проекта.
