# 05-flows — сквозные сценарии

От события до кадра. Каждый сценарий — цепочка узлов: где решение принимается,
где превращается в кривую, где становится пикселями. Собрано после разбора всех
слоёв; детали узлов — в `00-map.md`, порядок выполнения — в `06-timing.md`.

Одна общая черта у всех сценариев: **React участвует только в начале**. Дальше
работают две шины вне React — план движения и поток кадров, — и до конца поездки
компонент не перерисовывается ни разу.

---

## 1. Клик по стрелке → кадр

```
NavigationZone onClick
  → navigation.move(±1, "click")            берёт fromVirtualIndex из ЖИВОЙ позиции
  → dispatch MOVE
  → carouselReducer                          resolveStepTransition: опора, цель, фаза
  → state.virtualIndex меняется
  → useMotionRunner (layout-эффект)          ключ replanInputs изменился
      ├→ buildCarouselSegment                намерение → профиль → кривая
      ├→ profileProgressStops                ОДНА кривая на сегмент
      ├→ startCompositorMotion               WAAPI на треке, startTime = startedAt
      ├→ controller.start({ isPassive })     SSOT позиции, без кадрового цикла
      └→ publishPlan({ kind: "waapi", … })
  → подписчики плана: точки/виджет строят свои анимации на ТОЙ ЖЕ кривой
  → onfinish → MOTION_SETTLED → фаза idle
```

Ключевое: компоузитор красит, контроллер считает, а план раздаёт **одну и ту же
кривую** трём потребителям. Разъехаться они не могут, потому что кривая и часы
общие.

## 2. Повторный клик в ту же сторону

Та же цепочка, но `isSameDirectionRepeat` в редьюсере переводит опору на
**визуальную** позицию и ставит цель на две страницы вперёд
(`REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES`). Фабрика сегментов видит намерение
`repeated-click` и берёт скоростной профиль вместо длительностного. Пятьдесят
кликов подряд не уводят колоду дальше двух страниц от того, что видит глаз —
закреплено тестом.

## 3. Свайп пальцем

```
pointerdown → usePointerSwipe (полка)        фаза press, окно перехвата 250 мс
  → useCarouselGesture: захват трека СИНХРОННО (cancelTrackMotion + applyTrackPosition)
     а START_DRAG — отложен на задачу
  → pointermove → applyTrackPosition          палец пишет прямо в контроллер
  → publishPlan({ kind: "follow" })           трек и точки красят покадрово
pointerup
  → flushPendingStart()                       гарантия: START_DRAG раньше END_DRAG
  → resolveDragRelease (domain)               направление / нажатая страница / геометрия
  → dispatch END_DRAG (со скоростями и часами отпускания)
  → useMotionRunner: старт = ДОВЕДЁННАЯ позиция (coast), а не точка отпускания
  → дальше как сценарий 1
```

Три скорости не взаимозаменяемы: `pointerReleaseVelocity` судит флик,
`uiReleaseVelocity` переводится в виртуальные единицы, `launchVelocity` задаёт
непрерывность запуска.

## 4. Автоплей

```
таймер useAutoplay (интервал)
  → shouldDeferTick()?  занят вьюпорт → перевзвести на ПОЛНЫЙ интервал
  → navigation.move(1, "autoplay")  ← та же дверь, что у пользователя
  → дальше как сценарий 1, но профиль автоплея и длительность autoplayDuration
```

Ворота паузы: невидимый вьюпорт, палец на ленте, собственная поездка, ховер с
задержкой. Автоплей не ходит в редьюсер напрямую — только через навигацию.

## 5. Дальний переход (GO_TO с телепортом)

```
handlePageSelect → dispatch GO_TO
  → transitions: resolveGoToPlan (motion/timing)
      летим, только если промежуточных страниц ≥ порога И хотя бы одна не показана
  → state.virtualIndex = посадка ПРЕФЛАЙТА, а канон уезжает в teleportVirtualIndex
     (окно рендера строится от virtualIndex — дальняя цель не должна протечь)
  → раннер: сегмент преflight, но план публикуется на ВСЮ команду
     (кривая переавторена на единичный шаг — виджет видит один непрерывный ход)
  → MOTION_SETTLED → редьюсер разрезает середину: virtualIndex = канон,
     isTeleportApproach = true, фаза остаётся step-jump
  → раннер: сегмент подхода (разгонная доля 0, тормозная своя)
  → MOTION_SETTLED → idle
```

## 6. Поворот экрана

```
media-запрос осей → useMedia (корень) → signature меняется
  ├→ data-orientation / data-<flag> на корне       CSS переключает раскладку
  ├→ SlideItem: viewportSignature пропом → useOrientationSwapVeil
  │     вуаль поднимается, ждёт decode()/load, крышка veilMaxMs
  └→ ResizeObserver → useSlotSizeSource: слот измерен заново
        └→ subscribe → useTrackBinding.rebaseTrack
              сносит компоузиторную поездку (её кадры в СТАРОМ пиксельном масштабе)
              и пере-пинивает трек на живой позиции
```

## 7. Смена данных колоды

```
новый slidesData → useCarouselSlideDeck → buildCarouselLayout → новый dataKey
  → SYNC_CONTEXT в рендере → reconcileStateToLayout
      dataKey или isFinite изменились → hardReset (контекст переносится)
      иначе → пропорциональный перенос страницы + step-instant
  → useSlideRenderModel: окно пересчитано, кэш VirtualSlide подрезан
  → useImageResourceRetention: стор картинок подрезан по живым URL
```

`image` слайда в `dataKey` **не входит**: добавление респонсивных вариантов не
сбрасывает позицию (закреплено тестом).

## 8. Две волны загрузки картинок

```
монтирование → полоса рендерит <img> (буферу пока нельзя: isFetchOn = false)
  → каждый <img> отчитывается в стор: loaded ИЛИ error
  → useSlideFetchReach: полоса отчиталась ВСЯ и колода стоит
  → защёлка isBufferOpen (правка состояния в рендере) → reach = весь буфер
  → буферные <img> монтируются и грузятся с низким приоритетом
  → <ResponsiveImages isPredecodeOn> (если подключён и включён):
        в покое декодирует уже закэшированные буферные картинки
```
