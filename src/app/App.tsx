import { useEffect, useRef, useState } from "react";

import appStyles from "./App.module.scss";
import {
  useBreakpoint,
  useCompactLandscape,
  useUserEnvironment,
} from "../shared";
import Carousel, {
  type CarouselHandle,
  type CarouselStatusSnapshot,
  type Slide,
} from "../components/Carousel/client";
import { Controls } from "../components/Carousel/client/modules/Controls";
import {
  Pagination,
  PaginationWidget,
} from "../components/Carousel/client/modules/Pagination";
import { Diagnostic } from "../components/Carousel/client/modules/Diagnostic";
import { ResponsiveImages } from "../components/Carousel/client/modules/ResponsiveImages";
import { useTheme } from "../theme/useTheme";

/**
 * Which slides document the demo shows — two PHOTO COLLECTIONS, each cut for
 * BOTH orientations from the same originals (`npm run gen:carousel` rebuilds
 * both):
 *  1 — nature collection (16:9 wide default, 9:16 tall crop for portrait);
 *  2 — family collection (same structure).
 * Within a set the pictures are identical on desktop / mobile / landscape /
 * portrait — orientation only changes the crop, never the photo. Swap the
 * constant by hand, or override per visit with `?slides=1|2` in the URL
 * (handy on a deployed build).
 */
const DEFAULT_SLIDES_SET: 1 | 2 = 2;

const SLIDES_SET: 1 | 2 = (() => {
  const raw = new URLSearchParams(window.location.search).get("slides");
  if (raw === "1") return 1;
  if (raw === "2") return 2;
  return DEFAULT_SLIDES_SET;
})();

const VISIBLE_BY_BREAKPOINT = {
  DESKTOP: 2,
  TABLET: 2,
  MOBILE: 1,
  DEFAULT: 3,
} as const;

const COMPACT_LANDSCAPE_VISIBLE_SLIDES = 2;

/** The generated content document, served from `public/` (see `npm run gen:carousel`). */
const SLIDES_DATA_URL = `${
  import.meta.env.BASE_URL
}carousel-slides${SLIDES_SET}.json`;

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
              isSwipeOn={true}
              isAutoplayOn={isAutoplay}
              isPaginationOn
              isSlideInteractiveOn={isInteractive}
              isPaginationInteractiveOn={!isTouch}
              durationAutoplay={3000}
              durationStep={1800}
              intervalAutoplay={2500}
              isFullPagesOn
              userEnvironment={userEnvironment}
              onSlideClick={openSlide}
              onCarouselStatusChange={(snapshot) => setStatus(snapshot)}
            >
              {isTouch ? <PaginationWidget /> : <Pagination />}
              <Controls />
              <ResponsiveImages
                isPreloadOn={true}
                isPredecodeOn={true}
                preloadPagesNr={2}
              />
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
