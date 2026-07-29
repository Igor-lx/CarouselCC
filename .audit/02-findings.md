# Находки — детали и якоря

## BUG

### F1 · `slides/useOrientationSwapVeil.ts:24-60` · critical-механизм / medium-частота · уверенность высокая
Эффект защищён ref-ом сигнатуры: `if (previousSignatureRef.current === signature) return;`.
Зависимости — `[imgRef, isBitmapShown, signature]`. Если `isBitmapShown` переключается в `false`
ПОКА вуаль поднята: cleanup ставит `cancelled = true` и гасит **fail-open таймер**
(`veilMaxMs`), затем эффект перезапускается и выходит на первой строке, потому что
`signature` не менялся. `isVeiled` остаётся `true` навсегда.

Последствие: `Carousel.module.scss:127-130` — `img[data-reorienting="true"] { opacity: 0 }`.
Слайд становится невидимым до следующего поворота устройства.

Конкретный сценарий: поворот экрана → вуаль поднята → браузер переселектил `<source media>`
и новый кроп отдал 404 → `reportError` → `status = "error"` → `isBitmapShown` = false →
вуаль залипла → ретрай через backoff успевает → `status = "loaded"` → `<img>` монтируется
с `data-reorienting="true"` → пустая карточка.

Форма починки: сбрасывать `setIsVeiled(false)` в cleanup, либо снимать вуаль не ref-guard'ом,
а обычным ключом эффекта.

---

## LOGIC

### F2 · `modules/Pagination/widget/*` · medium · уверенность средне-высокая
Виджет документирован как «несвязанный счётчик шагов, **unbounded**» (`docs/architecture/modules.md:82`),
и `stepTarget.ts:27-28` действительно цепляет `memory.target + direction` без ограничения.
Но покрытие элементов фиксировано:
- `usePaginationWidgetBinding.ts:45` `DOT_COVERAGE_MARGIN_SLOTS = 2`
- `usePaginationWidgetBinding.ts:48` `ACTIVE_DOT_COUNT = 4`

При `|target − from| > 3` `math/trajectory.ts:76-85` (`activeTrajectoryIds`) возвращает больше id,
чем есть оверлеев, и лишние молча отбрасываются в `:387-393`. Отбрасывание **асимметрично**:
`low = floor(min(from,target))`, поэтому при движении вперёд теряется id ЦЕЛИ (подсветка прибытия
не анимируется, а «прыгает» на finalize), при движении назад — хвостовой.
Тот же класс у обычных точек: `lowId` в `:356` считает окно от `min(from,target)` с тем же
фиксированным запасом.

Воспроизведение: серия быстрых кликов, при которой визуальная позиция отстаёт от цепочки
шагов виджета на 4+ шага.

### F3 · `shared/engines/gesture/swipe/internals/resolveSwipeDirection.ts:32-48` · medium · уверенность средняя
В ветке флика направление берётся из знака **смещения**:
```
if (flicked) return { direction: rawOffset < 0 ? "left" : "right", pointerReleaseVelocity: gestureVelocity };
```
Знак `gestureVelocity` при этом не проверяется. Жест «увёл вправо на 40px, затем быстро
фликнул влево, не дойдя обратно до начала» (rawOffset = +25, gestureVelocity = −0.6) даёт
`direction = "right"` при отрицательной скорости — два выхода одного вызова противоречат
друг другу. Дальше `sameDirectionSpeed` обнулит эту скорость, и поездка стартует с места,
хотя палец двигался быстро.

Ветка дистанции (`:50`) использует смещение законно — там это и есть критерий.

### F4 · `modules/Pagination/widget/PaginationWidget.module.scss:1` · low
Единственный `.module.scss` компонента без `@layer`. Соседи: `Carousel.module.scss:2`
(`@layer baseStyles`), `Controls.module.scss:2` и `Pagination.module.scss:2` (`@layer components`),
порядок объявлен в `globals.scss:1`. Незаслоённые правила выигрывают у ЛЮБЫХ заслоённых,
т.е. виджет один выпадает из каскадного контракта компонента.

### F5 · `Carousel.tsx:132` · low
`const useMemoDeckCarriesImageSets = useMemo(...)` — обычная переменная с именем хука.

---

## IMPL

### F6 · три независимых измерения одного элемента · high
- `Carousel.tsx:147` → `useResponsiveImageSizes` → `useMeasuredSlotSize` (свой ResizeObserver + `resize`)
- `gesture/useCarouselGesture.ts:265` → `useMeasuredSlotSize` (второй ResizeObserver + `resize`)
- `geometry/useTrackBinding.ts:244-275` → третий ResizeObserver + `resize`

Все три наблюдают ОДИН элемент (`data-carousel-viewport`) и все три зовут `measureSlotSize`,
внутри которого `window.getComputedStyle(viewport)` (`domain/track.ts:46`). На каждый resize/поворот —
три форсированных чтения стиля именно в тот момент, когда карусель наиболее хрупка.

Хуже: **два разных ответа на один вопрос**. `useMeasuredSlotSize:33` возвращает `Math.round(slot)`
с эпсилоном 1px; `useTrackBinding` держит сырой float с эпсилоном 0.5px. Жест калибруется по
округлённому числу, трек рисуется по неокруглённому.

Первые два инстанса (`useResponsiveImageSizes` и `useCarouselGesture`) получают **идентичные**
входы (`viewportRef`, `layout.visibleSlidesCount`) — чистое дублирование.

### F7 · `slides/useOrientationSwapVeil.ts:20` · medium
`useSlideViewport()` вызывается В КАЖДОМ `SlideItem` → `useMedia(SLIDE_VIEWPORT_AXES)` →
5 подписок `useSyncExternalStore` + сборка `MediaState` (Map + замыкание + `Object.fromEntries`)
на слайд. При `visibleSlidesNr = 3` и буфере ×4 окно ≈ 27 слайдов → ≈135 подписок и 27
пересборок `MediaState` на каждое изменение сигнатуры.

Хуку нужен ровно один скаляр — `signature`. Корень уже читает то же самое один раз
(`Carousel.tsx:86`). Это прямое нарушение принципа, заявленного в `docs/architecture/overview.md:19`
(«один читает на границе, остальные получают»).

### F8 · `gesture/useCarouselGesture.ts:133` · low
`dispatch` в массиве зависимостей `startDragFromCurrentPosition`, но в теле не используется
(используется `flushPendingStart`, у которого `dispatch` свой).

### F9 · `modules/Pagination/widget/PaginationWidgetDot.tsx:9` · low
`forwardRef` (deprecated в React 19) при том, что весь остальной код уже на ref-as-prop
(`PaginationDot.tsx:15`, `public-api/types.ts:90`).

---

## RISK

### F10 · `motion/useMotionRunner.ts:80-93` vs `:269-289` · medium
Строка-ключ дедупликации и массив зависимостей — два поддерживаемых вручную списка одних
и тех же полей состояния, и они **уже расходятся**: `state.layout.visibleSlidesCount` есть
в зависимостях и отсутствует в ключе. Сегодня это безвредно (реконсиляция всё равно меняет
`motionPhase`), но любое новое поле, добавленное в один список и забытое в другом, даёт
либо пропущенный, либо лишний ре-план — без всякого сигнала.

### F11 · `areCarouselPropsEqual.ts:38-60` · low
`areChildrenEquivalent` → `shallowEqualProps` → `areChildrenEquivalent` рекурсирует по
вложенным `children` без ограничения глубины. Сегодня дети — плоские слот-модули; глубокое
дерево в слоте даст рекурсию на каждый рендер хоста.

### F12 · `slides/useSlideRenderModel.ts:69-80` · low
`layoutOriginRef` читается и пишется внутри `useMemo` — побочный эффект в фазе рендера.
Работает, потому что запись идемпотентна, но формально вне контракта React.

---

## ARCH

### F13 · `tsconfig.app.json:20-25` · medium
`strict: true`, но **без** `noUncheckedIndexedAccess` и `exactOptionalPropertyTypes` — при том
что код по всей базе написан так, будто оба включены:
- `records[loopedSlideIndex(...)]!` (`useSlideRenderModel.ts:104`), `stops[i]!` (`progressCurve.ts:154`),
  `keyframes[0]!` (`useTrackBinding.ts:165`), `zones[zones.length-1]!` (`profile.ts:56`) — десятки мест;
- `...(defaultSrc !== undefined && { defaultSrc })` (`buildSlide.ts:70`) — идиома
  `exactOptionalPropertyTypes`.

Каждый такой `!` сегодня — недоказанное утверждение: компилятор его НЕ проверяет, сигнатура
обещает больше, чем гарантирует код.

---

## Не найдено

- **DEAD** — мёртвого/недостижимого кода внутри одной изолированной единицы нет.
  Дублирование между `shared/`-папками — осознанное решение (проверено побайтово, форки не разошлись).
- **DOC-DRIFT** — существенных расхождений кода и доков на выборке (overview / slides / modules /
  styling / autoplay / gesture README) не обнаружено.
