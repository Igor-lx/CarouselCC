import { useEffect, useRef, useState } from "react";

import appStyles from "./App.module.scss";
import { useCompactLandscape } from "./useCompactLandscape";
import { useBreakpoint, useUserEnvironment } from "../shared";
import Carousel, {
  type CarouselHandle,
  type CarouselStatusSnapshot,
  type Slide,
} from "../components/Carousel/client";
import { Controls } from "../components/Carousel/client/modules/Controls";
import { Pagination } from "../components/Carousel/client/modules/Pagination";
import { PaginationWidget } from "../components/Carousel/client/modules/PaginationWidget";
import { Diagnostic } from "../components/Carousel/client/modules/Diagnostic";
import { useTheme } from "../theme/useTheme";

/**
 * Which slides document the demo shows. Two generated sets exist
 * (`npm run gen:carousel` rebuilds both):
 *  1 — full 16:9 images; portrait viewports get the 9:16 art-directed crop;
 *  2 — the vertical 9:16 set everywhere (tall columns on desktop too).
 * Swap the constant by hand, or override per visit with `?slides=1|2` in the
 * URL (handy on a deployed build).
 */
const DEFAULT_SLIDES_SET: 1 | 2 = 1;

const SLIDES_SET: 1 | 2 = (() => {
  const raw = new URLSearchParams(window.location.search).get("slides");
  if (raw === "1") return 1;
  if (raw === "2") return 2;
  return DEFAULT_SLIDES_SET;
})();

// Layout per set: a vertical 9:16 card is ~3x taller than a 16:9 one at the
// same slot width, so wide screens take more columns to stay inside the
// window height.
const VISIBLE_BY_BREAKPOINT =
  SLIDES_SET === 2
    ? ({ DESKTOP: 4, TABLET: 3, MOBILE: 1, DEFAULT: 4 } as const)
    : ({ DESKTOP: 2, TABLET: 2, MOBILE: 1, DEFAULT: 3 } as const);

const COMPACT_LANDSCAPE_VISIBLE_SLIDES = SLIDES_SET === 2 ? 4 : 2;

/** The generated content document, served from `public/` (see `npm run gen:carousel`). */
const SLIDES_DATA_URL = `${import.meta.env.BASE_URL}carousel-slides${SLIDES_SET}.json`;

const openSlide = (slide: Slide) => {
  window.open(String(slide.content), "_blank");
};

export default function App() {
  const { toggleTheme, theme } = useTheme();
  // One read of the user environment at the app boundary: used here for the
  // responsive layout and forwarded whole into <Carousel> (which never detects
  // the environment itself). The hook returns a memoised, stable object.
  const userEnvironment = useUserEnvironment();
  const isTouch = userEnvironment.touch;
  const isCompactLandscape = useCompactLandscape();

  const [isAutoplay, setIsAutoplay] = useState(false);
  const [isInteractive, setIsInteractive] = useState(false);

  // External control + status: the carousel is driven from a different part of
  // the page through its imperative handle, and reports a low-frequency status
  // snapshot ("page X of Y" + idle) back for the label.
  const carouselRef = useRef<CarouselHandle>(null);
  const [status, setStatus] = useState<CarouselStatusSnapshot | null>(null);

  const device = useBreakpoint(VISIBLE_BY_BREAKPOINT);

  // Layout-only: how many slides share the viewport. Orientation can change
  // this, but it never changes slide identity (one responsive set), so rotation
  // re-flows the layout without resetting the viewing position.
  const visibleSlidesNr =
    isTouch && isCompactLandscape ? COMPACT_LANDSCAPE_VISIBLE_SLIDES : device;

  // Content document, fetched at load from the static file the generator
  // produced (one stable responsive set; the browser selects the asset). The
  // data is consumed as-is — validation is intentionally not part of this flow.
  const [slidesData, setSlidesData] = useState<Slide[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    fetch(SLIDES_DATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((json) => {
        if (isCurrent) setSlidesData(json as Slide[]);
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;
        console.error("[App] failed to load carousel slides data", error);
        setLoadFailed(true);
      });
    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <main className={appStyles.app}>
      <section className={appStyles.page}>
        <div className={appStyles.header}>
          <button
            className={appStyles.button}
            onClick={() => setIsAutoplay((prev) => !prev)}
          >
            {isAutoplay ? "⏩" : "⏸️"}
          </button>
          <button
            className={appStyles.button}
            style={{ paddingBottom: 2 }}
            onClick={toggleTheme}
          >
            {theme === "light" ? "☀️" : "🌙"}
          </button>
          <button
            className={appStyles.button}
            onClick={() => setIsInteractive((prev) => !prev)}
          >
            {isInteractive ? "INT" : "NO"}
          </button>
        </div>

        <div className={appStyles.component}>
          {loadFailed ? (
            <p>Failed to load carousel data.</p>
          ) : slidesData === null ? (
            <p>Loading…</p>
          ) : (
            <Carousel
              ref={carouselRef}
              visibleSlidesNr={visibleSlidesNr}
              slidesData={slidesData}
              // Set 2 is vertical in EVERY orientation: ride the className
              // override to pin the slide-box aspect to the asset aspect
              // (unlayered app CSS wins over the component's @layer default).
              className={
                SLIDES_SET === 2
                  ? { outerContainer: appStyles.verticalSlides }
                  : undefined
              }
              isAuto={isAutoplay}
              isPaginationOn
              isInteractive={isInteractive}
              durationAutoplay={4000}
              durationStep={4000}
              jumpSpeedMultiplier={12}
              intervalAutoplay={3000}
              isPagePaddingOn
              userEnvironment={userEnvironment}
              onSlideClick={openSlide}
              onCarouselStatusChange={(snapshot) => setStatus(snapshot)}
            >
              {isTouch ? <PaginationWidget /> : <Pagination />}
              <Controls />
              <Diagnostic />
            </Carousel>
          )}
        </div>
      </section>
      <section className={appStyles.page}>
        <div className={appStyles.header}>
          <button
            className={appStyles.button}
            onClick={() => carouselRef.current?.prev()}
            disabled={status?.isAtStart ?? false}
          >
            ‹
          </button>
          <span className={appStyles.button} style={{ cursor: "default" }}>
            {status
              ? `${status.currentPageIndex + 1} / ${status.pageCount}`
              : "—"}
          </span>
          <button
            className={appStyles.button}
            onClick={() => carouselRef.current?.next()}
            disabled={status?.isAtEnd ?? false}
          >
            ›
          </button>
        </div>
      </section>
    </main>
  );
}
