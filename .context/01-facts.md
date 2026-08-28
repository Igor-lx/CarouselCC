# 01-facts — то, чего нет ни в коде, ни в документации

Дополнение к [`00-map.md`](./00-map.md). Там — что делает каждый файл. Здесь —
**механически проверенные факты о проекте как о целом**: базовая линия, граф
зависимостей, радиус поражения правок, мёртвые экспорты, дрейф документации,
ловушки инструментов. Всё получено скриптами, не чтением.

## Как читать пути в этом документе и в `00-map.md`

Пути сокращены и лежат на **разной** глубине — дописывать один общий префикс
нельзя:

| Сокращение | Реальный путь |
| --- | --- |
| `client/**` | `src/components/Carousel/client/**` |
| `docs/**` (architecture, adr, config) | `src/components/Carousel/client/docs/**` |
| `boundary/**`, `data-gen/**` | `src/components/Carousel/**` |
| `shared/**` | `src/shared/**` |
| `app/**`, `main.tsx`, `globals.scss` | `src/**` |
| `public/**`, `package.json`, `tsconfig*.json` | от корня репозитория |

⚠️ `docs/` — **не** в корне репозитория, а внутри `client/`. Якоря в коде
(`// See docs/architecture/motion.md`) указывают именно туда.

Отсюда и относительные импорты в коде: `../../../../shared` из
`client/motion/*` — это `src/shared`, а не папка внутри карусели.

---

## A. Базовая линия (зафиксирована до правок)

| Проверка | Команда | Результат |
| --- | --- | --- |
| Типы | `npm run typecheck` | **exit 0** |
| Тесты | `npm test` | **110 файлов / 957 тестов — все зелёные**, ~39 c |
| Сборка | `npm run build` | **exit 0**, 227 модулей, 943 мс |
| Линт | `npm run lint` | **exit 0** (заведён после базовой линии) |
| Формат | `npm run format:check` | **exit 0** (сплошной прогон выполнен) |

**Размеры прод-бандла (эталон для сравнения после правок):**

| Артефакт | Размер | gzip |
| --- | --- | --- |
| `dist/assets/index-*.js` | 282.56 кБ | **88.70 кБ** |
| `dist/assets/index-*.css` | 13.48 кБ | 3.28 кБ |
| `dist/index.html` | 1.80 кБ | 0.85 кБ |

После прохода линта: `index-*.js` — 282.74 кБ / gzip **88.75 кБ** (+0.18 / +0.05
кБ). Рост объясним: страж `openSlide` в `App.tsx`, два хелпера цели страницы в
`transitions.ts`, `describeOpaque` в форматтере диагностики.

**Демо-данные (`public/carousel-slides1.json`):** 12 слайдов, `id` — UUID,
`content` уникальны, у каждого `image.srcSet` (480/720) + `defaultSrc` (720) +
один art-directed `<source>` на compact-landscape (480/720/1080/1600).
⚠️ **`alt` пуст у всех 12** — генератор скаффолдит `""` и ждёт ручного
заполнения (`data-gen/README.md:52`). Следствие в рантайме: каждая картинка
декоративна для AT, а при ошибке загрузки слайд показывает
`errAltPlaceholder` («Downloading Error»), а не описание.
Второй набор (`carousel-slides2.json`) устроен так же.

**Ловушка №1 (записана в самом `tsconfig.json:1-7`):** корневой конфиг —
solution-style, `files: []`. `tsc --noEmit` в корне проверяет **ноль файлов** и
выходит с кодом 0. Зелёный результат, который ничего не доказывает. Проверять
только через `npm run typecheck` (`tsc -b`, собирает три референса) или
`npm run build`.

**Три проекта TS:** `tsconfig.app.json` (src минус data-gen минус тесты),
`tsconfig.node.json` (vite/vitest-конфиги + data-gen, lib ES2023 без DOM),
`tsconfig.test.json` (наследует app, только тесты, + типы node/vite).

**Строгость, объясняющая форму кода:** `strict`, `noUncheckedIndexedAccess`
(отсюда `!` после индексации), `exactOptionalPropertyTypes` (отсюда
`?: T | undefined` вместо `?: T`), `noUnusedLocals`/`noUnusedParameters`
(отсюда `void x` в тестах), `erasableSyntaxOnly`, `noFallthroughCasesInSwitch`,
`verbatimModuleSyntax` (отсюда `import type` везде).

---

## A2. Инструменты проверки (заведены после базовой линии)

| Файл | Что задаёт |
| --- | --- |
| `eslint.config.js` | flat config: `typescript-eslint` с типовой проверкой (`projectService`), `react-hooks`, `react-refresh`; форматирование целиком отдано Prettier через `eslint-config-prettier` |
| `.prettierrc.json` | `printWidth: 80`, двойные кавычки, `trailingComma: "all"`, `endOfLine: "auto"` |
| `.prettierignore` | `dist`, `coverage`, `node_modules`, `public`, `package-lock.json`, а также **все `*.md`**: markdown здесь — свёрстанная руками проза, Prettier только доливает в неё пустые строки |
| `.gitattributes` | `* text=auto eol=lf` — концы строк перестали зависеть от `core.autocrlf` машины (на этой он `true`, файлы в рабочем дереве были CRLF) |

**Три обоснованных исключения в конфиге линта, все с комментарием на месте:**

1. `@typescript-eslint/require-await` выключен в `**/tests/**`: React-`act`
   возвращает thenable только при async-скоупе, поэтому `async` без `await`
   внутри — требование API, а не оплошность.
2. `react-refresh/only-export-components` выключен в `client/modules/**`:
   слот-компоненты собираются как `Object.assign(Component, { slot })`, Fast
   Refresh такую форму не отслеживает, а форма — это контракт модуля.
3. `react-hooks/globals` и `react-hooks/refs` выключены в `**/tests/**`:
   фикстуры живут на модульном уровне и переприсваиваются между кейсами, а ref
   тест читает и подменяет намеренно. Оба правила описывают код компонентов.
4. **PENDING** — `react-hooks/refs` выключено для **шести файлов** (список в
   `eslint.config.js`). Везде остальное правило включено.

**Разбор группы React Compiler (выполнен, кроме PENDING).** Было 110
срабатываний, осталось 59, и все они — в шести названных файлах:

| Правило | Было | Стало | Чем закрыто |
| --- | --- | --- | --- |
| `immutability` | 4 | **0** | проброс потребительского ref вынесен в `assignHostRef` на уровень модуля (`usePointerSwipe`, оба форка) |
| `set-state-in-effect` | 3 | **0** | «нечего ждать» считается в рендере (`useSlideFetchReach`), защёлка буфера — правкой состояния во время рендера, сброс hover-паузы — тем же приёмом (`useAutoplay`) |
| `refs` (зеркала значений) | 20 | **0** | запись перенесена в эффект: `useMotionPaint`, `useKineticValue`, `usePointerSwipe`, `useViewportBusy` (все — оба форка, где есть) и в layout-эффект: `useTrackBinding`, `useSlotSizeSource`, `useVisualPosition`, `usePaginationFade` |
| `refs` (ленивый синглтон) | 6 | **2** | `useMotionController` переведён на инициализатор `useState` (оба форка); `useImageResourceStoreInstance` оставлен с точечным `eslint-disable` и обоснованием — условное создание нельзя выразить через `useState` |
| `refs` (состояние в ref из рендера) | 53 | 53 | **PENDING**, это задача 3(b) |
| `globals` | 24 | 24 | все в тестах, правило там выключено |

Ключевой факт для 3(b): **React Compiler в проекте не включён** (React 19,
`@vitejs/plugin-react` без `babel-plugin-react-compiler`). Правила группы —
готовность к компилятору и гигиена конкурентного рендера, а не сегодняшние
падения.

---

## B. Циклическая зависимость — ровно одна

```
client/motion/index.ts
  → motion/useCarouselMotionExecution.ts
  → motion/useMotionRunner.ts
  → client/geometry/index.ts
  → geometry/useTrackBinding.ts
  → client/motion/index.ts      ← замыкание
```

**Механика:** `useTrackBinding` берёт из бочки `../motion` значения
(`keyframesAlongStops`, `startPinnedAnimation`) и тип `MotionPlanSource`;
`useMotionRunner` берёт из бочки `../geometry` тип `TrackBindingApi`.

**Почему сейчас не ломается:** обратное ребро (`useMotionRunner → geometry`) —
**только тип**, он стирается при компиляции, поэтому в рантайме цикла нет.
**Что это значит для правок:** любая правка, превращающая этот импорт в
значение, замкнёт настоящий рантайм-цикл (порядок инициализации модулей,
`undefined` при первом обращении). Разрывается тривиально — импортировать
`keyframesAlongStops`/`startPinnedAnimation` в `useTrackBinding` напрямую из
`shared`, минуя транзитную бочку `client/motion`.

---

## C. Радиус поражения: что ломает больше всего

Число не-тестовых импортёров. Правка в верхних строках задевает много мест.

| Импортёров | Файл |
| --- | --- |
| 31 | `shared/index.ts` |
| 20 | `client/domain/index.ts` |
| 16 | `client/config/index.ts` |
| 15 | `client/public-api/types.ts` |
| 11 | `client/context/index.ts`, `client/state/index.ts` |
| 10 | `client/modules/Diagnostic/types.ts` |
| 8 | `client/motion/index.ts`, `shared/clientState/shared/useMediaQuery.ts` |
| 7 | `client/state/types.ts`, `widget/types.ts`, `shared/theme/internal/constants.ts` |
| 6 | `domain/types.ts`, `imageResource/types.ts`, `slots/index.ts`, `visual-position/index.ts`, оба `motion/runtime/types.ts` |

**Файлы, которые не импортирует никто (не-тестовый код):**

| Файл | Статус |
| --- | --- |
| `client/modules/index.ts` | **мёртвая бочка** — App берёт каждый модуль глубоким путём |
| `data-gen/index.ts` | **мёртвая бочка** — `cli.ts` берёт `runDataGen` напрямую |
| `data-gen/cli.ts` | точка входа npm-скрипта — ожидаемо |
| `main.tsx` | точка входа приложения — ожидаемо |
| `shared/viewportObservation/useIsomorphicLayoutEffect.ts` | «спящая» копия, помечена в коде и README — ожидаемо |
| `vite-env.d.ts` | ambient — ожидаемо |

---

## D. Мёртвые экспорты (проверено грепом, не эвристикой)

Разделены по смыслу — не всё «мёртвое» подлежит удалению.

### D1. Настоящий мусор — транзитные реэкспорты, которыми никто не пользуется

- `client/motion/index.ts` → `isWaapiSupported`, `sampleProgressStops`.
  Проверено: в `client/**` не встречаются нигде. (`keyframesAlongStops`,
  `positionAtNow`, `startPinnedAnimation` — живые, их берут модули пагинации.)
- `client/presentation/index.ts` → `buildRootCssVars`, `buildSlideCssVars`,
  `buildSlideClassMap`, `buildFlagAttributes` — тесты и `useCarouselPresentation`
  импортируют из `../cssVars` / `../domPayload` напрямую.
- `client/slides/index.ts` → `useImageResource` — `SlideItem` берёт из
  `./imageResource`.
- `client/domain/index.ts` → `clampedVisibleSlidesCount`,
  `resolveLargestImageCandidate`, `resolveLargestSrcSetCandidate` — используются,
  но всегда из `../slides` напрямую.
- `client/modules/index.ts` → все 4 экспорта (бочка мертва целиком).
- `data-gen/index.ts` → все 4 экспорта (бочка мертва целиком).

### D2. Мёртвое внутри форка

- `shared/clientState/media/useMedia/internal/useOrientation.ts` →
  **сам хук `useOrientation` не вызывается никогда.** Форку нужны только
  константы `PORTRAIT_ORIENTATION_QUERY` / `LANDSCAPE_ORIENTATION_QUERY`;
  вместе с хуком в форк тянется и импорт `useMediaQuery`.
- `shared/clientState/media/useMedia/internal/resolveActiveBreakpoint.ts` →
  `STANDARD_BREAKPOINTS` (в форке не нужен, оси задаёт карусель).
- `shared/engines/kinetic/internal/motion/index.ts` → 14 реэкспортов, которых
  фасад не касается; `internal/gesture/index.ts` → 4.
  **Это НЕ мусор:** барьер форка обязан быть полным, чтобы папка выносилась
  копированием. Трогать нельзя.

### D3. Публичная поверхность — не трогать

- `client/index.ts` → `SLIDE_CLASS_KEYS`, `public-api/index.ts` →
  `CLASS_NAME_KEYS` + `SLIDE_CLASS_KEYS`. Значения живут (через
  `../public-api/types` напрямую), реэкспорты — контракт для хоста.
  **Но асимметрия реальна:** `CLASS_NAME_KEYS` отдан из `public-api/index.ts`
  и НЕ отдан из `client/index.ts`, хотя `ClassNameMap` ключуется именно им.
- `shared/theme/index.ts` → `ThemeStateProvider`, `THEME_MODES` — заявленный
  публичный API коробки (README описывает «Mode B» на `ThemeStateProvider`).
- Экспортируемые типы без потребителей (`GoToPlan`, `ModuleRenderPolicy`,
  `PaginationWidgetBinding`, `CoastedLaunchInput`, …) — часть читаемого
  контракта модуля.

---

## E. Дрейф документации (код — источник истины; доку чинить)

Найдено сверкой доков с кодом. По правилу репозитория это дефекты **доки**.

1. **`docs/architecture/geometry.md:115,120`** — описывает функцию
   **`syncGeometry`**. Такой функции нет: в
   `geometry/useTrackBinding.ts:208,221` это `rebaseTrack` и
   `rebaseForLayoutOrigin`.
2. **`docs/architecture/public-api.md:65`** — «`isFullPagesOn` … Clones **tail**
   slides». Код клонирует **головные**: `domain/slides.ts:35`
   `records[offset % length]` при `offset` с нуля. `domain.md:51` и
   `slides.md:16` говорят «head» — правы они, `public-api.md` нет.
   (Тест `deckPadding.test.ts:73` тоже фиксирует «wraps back to slide 0».)
3. ~~**`docs/architecture/slides.md:29`** — «no separate **predecode**
   machinery» против предекод-менеджера в `modules.md:132`.~~
   **ИСПРАВЛЕНО** — заменено на «no separate **preload** machinery».
4. **`shared/theme/README.md:199-201`** — «`core/` is SSR-safe … `chrome/`
   touches `document`». Папок `core/` и `chrome/` нет: это
   `ThemeStateProvider.tsx` и `internal/BrowserChromeSync.tsx`.
5. **`data-gen/README.md:141`** — осиротевший заголовок `## Idempotent` без
   тела; его текст лежит ниже (`:160-162`), под чужим разделом.

---

## F. Утверждения доков, которые код не выражает сам

> **Статус этого раздела: заявки, а не факты.** Ниже — то, что документация
> проекта утверждает и чего из кода не видно. Часть заявок опирается на прошлые
> прогоны разработки и замеры, сделанные до нас. Мы их **не наследуем как
> авторитет**: каждая проверяется заново, когда до неё дойдёт дело. Держать в
> голове стоит не вывод, а **место, где он может выстрелить** — чтобы правка
> не прошла мимо непроверенного допущения молча.

- **ADR-001** — `reconcileStateToLayout` применяется РОВНО в двух точках
  (проекция в рендере + вход каждой команды) и обязан быть **идемпотентным**;
  это жёсткий контракт, закреплённый тестом.
- **ADR-002** — все входы caller-owned. Никакой валидации/нормализации в
  проде **нигде**, включая перерасход долей профиля. Diagnostic только
  наблюдает.
- **ADR-003** — почему не `transition: transform`: (1) профиль accel/cruise/decel
  невыразим одним безье, (2) ретаргет теряет скорость, (3) нечего разделить с
  точками и виджетом и нет `startTime`, (4) `transitionend` теряется.
- **`shared/README.md:23-25`** — «каждая заготовка держит свои копии хуков; **то,
  что не дублируется никогда, — стор**». Единственный стор — `clientState/shared/useMediaQuery`.
  Читать это надо узко: правило про **один `useMediaQuery.ts` на проект**, а не
  про запрет модульного состояния как такового. `useIsTouchDevice` и
  `useDataSaver` держат собственные синглтоны законно — их источники
  (`pointerdown`, `navigator.connection.saveData`) через media-запрос не
  выражаются. Разобрано в § H.2.
- **`shared/engines/gesture/README.md:21`** — «**Touch pointers only** (mouse/pen
  ignored)» — принцип движка, задокументирован. В `public-api.md` карусели этого
  нет (см. `00-map.md § S`).
- **`viewport.md:36-41`** — `useSlideViewport` вызывается **только корнем**, это
  правило: каждый лишний `useMedia` добавляет по подписке на условие и пересборку
  `MediaState` на каждом экземпляре. Листья получают значение пропом.
- **`diagnostics.md:29-33`** — в файлах `checks/` **запрещены модульные
  side-effect'ы** (`const X = new Set(...)` на верхнем уровне): бандлер не
  докажет чистоту и оставит строки в проде. Таблицы строятся внутри коллекторов.
- **`styling.md:83-101`, `modules.md:56-67`** — «два эффекта на одном свойстве»:
  CSS-transition + WAAPI на opacity/transform роняют анимацию Blink на главный
  поток. Отсюда `transition: none` на время поездки и постоянный
  `will-change` у точек. Помечено «Do not remove».
- **`presentation.md:48-68`** — кэш стилей полосы существует, потому что
  `virtualSlides` пересобирается на каждом флипе `isMoving`, то есть дважды за
  поездку, в двух самых дорогих кадрах.
- **`autoplay.md:58-64`** — `onStep`/`onGoToStart` обязаны быть стабильны:
  свежая идентичность перезаряжает таймер и отсчитывает интервал от рендера,
  а не от тика.

---

## G. Указатель документации (что где искать)

| Нужно понять | Файл |
| --- | --- |
| Владение, 5 SSOT, карта папок, порядок чтения | `docs/architecture/overview.md` |
| Публичный контракт, пропы, DOM, форма данных | `docs/architecture/public-api.md` |
| Редьюсер, разрешение шага, повторный клик | `docs/architecture/state.md` |
| Чистое ядро: страницы, окно, видимость, транс­формы | `docs/architecture/domain.md` |
| Сегменты, handoff, телепорт, компоузитор, полосы | `docs/architecture/motion.md` |
| SSOT видимой позиции, пропуск кадров | `docs/architecture/visual-position.md` |
| Измерение слота, запись трансформа, два владельца краски | `docs/architecture/geometry.md` |
| Свайп, слот-нормализация, коастинг, две скорости | `docs/architecture/gesture.md` |
| Окно рендера, две волны загрузки, стор картинок, вуаль | `docs/architecture/slides.md` |
| Оси вьюпорта, data-атрибуты, canonical media | `docs/architecture/viewport.md` |
| JS→CSS контракт, кэш полос | `docs/architecture/presentation.md` |
| Правила стилей и ловушки рендеринга | `docs/architecture/styling.md` |
| Разделение контекста по частоте | `docs/architecture/context.md` |
| Поведение каждого слот-модуля | `docs/architecture/modules.md` |
| Dev-слой, нулевая цена в проде | `docs/architecture/diagnostics.md` |
| Осознанные компромиссы | `docs/architecture/quality.md` |
| Значение каждой константы | `docs/config/*.md` (8 файлов) |
| Три решения с долгими последствиями | `docs/adr/000{1,2,3}-*.md` |
| Движки как самостоятельные продукты | `shared/engines/{motion,gesture,kinetic}/README.md` |
| Правило «стор не дублируется» | `shared/clientState/shared/README.md` |
| Генератор контента, конфиг, идемпотентность | `data-gen/README.md` |
| Тесты границы client ↔ data-gen | `boundary/README.md` |

---

## H. Решения по объёму (получены от заказчика)

1. **Стенд правим только по необходимости.** `App.tsx`, `App.module.scss`,
   `globals.scss`, `index.html`, данные в `public/` трогаем лишь тогда, когда
   этого требует правка в компоненте или на полках. Их собственные
   шероховатости идут отдельным списком «к сведению», не в план:
   - `App.tsx:35-40` — чтение `window.location.search` на модульном уровне
     (SSR-враждебно, вычисляется при импорте);
   - `App.module.scss` — сырые `@media` вместо осей (это хост, у него свои
     оси, — формально допустимо);
   - `alt: ""` у всех 12 слайдов в обоих `public/carousel-slides*.json`.

2. **ЗАКРЫТО — собственный стор у `useIsTouchDevice` и `useDataSaver` не дефект.**
   Ранее здесь стоял открытый вопрос: почему эти два хука держат модульный
   синглтон, а `useIsReducedMotion` делегирует в `shared/useMediaQuery`.
   Разобрано, вопрос снят.

   `useMediaQuery` — мультиплексор «один слушатель на строку media-запроса», и
   больше он не умеет ничего. Два хука наблюдают источники, которые в
   media-запрос не выражаются:
   - `useIsTouchDevice` = `(pointer: coarse)` **ИЛИ** первый `pointerdown` с
     `pointerType === "touch"` (защёлка + снятие слушателя);
   - `useDataSaver` = `(prefers-reduced-data: reduce)` **ИЛИ**
     `navigator.connection.saveData` с её собственным событием `change`.

   `useIsReducedMotion` делегирует не потому, что «правильнее», а потому что он
   чистый media-запрос и ничего сверх. Всё это задокументировано таблицей в
   `environment/library/README.md:9-11`, включая цену делегирования: «rides
   `../../shared/useMediaQuery` (**copy that too**)».

   Конвенция `shared/README.md` про **один `useMediaQuery.ts` на проект**, а не
   про запрет модульного состояния вообще. Собственный синглтон у хука с
   не-media источником её не нарушает.

   Замысел полок (подтверждён заказчиком): нужен один хук — копируешь только
   его, он самодостаточен; нужны все — берёшь фасад `useUserEnvironment`.
   Фасад стор не объединяет и не должен: три сигнала смотрят в три несвязанных
   источника, объединять нечего. Байт-идентичность копий `library/*` и
   `useUserEnvironment/internal/*` — это барьер форка, то есть цель, а не
   дублирование по недосмотру. Обе ветки одновременно в один проект не берут.

---

## I. Проход «вырезать историю» (выполнен)

По решению заказчика из кода, доков, README и шапок тестов вырезаны **следы
прошлой разработки**: замеры, модели устройств, «раньше было / мы починили /
мы пробовали», названия прошлых регрессий. **Оставлены** — и там, где нужно,
переписаны в явную форму `CONSTRAINT — …`:

- само ограничение;
- на что оно влияет;
- что сломается, если его убрать.

Затронуто ~35 файлов. Правки — только в комментариях, документации и
названиях `it(...)`; исполняемый код не менялся. Копии в
`kinetic/internal/**` и `environment/library/**` правились **парно** — сверка
диффом после прохода вернула прежние расхождения (2 / 9 / 9 / 9 / 6 / 6), то
есть форки не разъехались.

Попутно исправлена мохибейка в трёх местах (`≤`, `≈`, `±`) — в `src` её больше
нет.

**Как это читать дальше.** Ни одно утверждение о поведении на устройстве,
о производительности и о том, «что будет, если убрать», больше не подкреплено
чужим замером. Всё это — гипотезы, которые мы проверяем сами, когда доходим
до соответствующего участка.

---

## J. Как перепроверить всё это одной командой

Скрипт анализа графа лежит в репозитории — `.context/graph.mjs`. Запускать из
корня репозитория (`c:\dev\CarouselCC`):

```
node .context/graph.mjs cycles   # циклические импорты
node .context/graph.mjs blast    # радиус поражения + файлы без импортёров
node .context/graph.mjs dead     # экспорты, которые никто не импортирует
```

Ограничение инструмента: файл, из которого делают `export *`, из анализа
мёртвых экспортов исключается (нельзя разобрать, что именно утянули).
