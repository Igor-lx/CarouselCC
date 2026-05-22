import { useMemo, useRef, useState } from "react";

import appStyles from "./App.module.scss";
import { CAROUSEL_SOURCES, CAROUSEL_SOURCES2 } from "./carouselData";
import { useCompactLandscape } from "./useCompactLandscape";
import { useBreakpoint, useUserEnvironment } from "../shared";
import Carousel, {
  type CarouselHandle,
  type CarouselStatusSnapshot,
  type Slide,
} from "../components/Carousel";
import { Controls } from "../components/Carousel/modules/Controls";
import { Pagination } from "../components/Carousel/modules/Pagination";
import { PaginationWidget } from "../components/Carousel/modules/PaginationWidget";
import { Diagnostic } from "../components/Carousel/modules/Diagnostic";
import { useTheme } from "../theme/useTheme";

const VISIBLE_BY_BREAKPOINT = {
  DESKTOP: 3,
  TABLET: 2,
  MOBILE: 1,
  DEFAULT: 3,
} as const;

const COMPACT_LANDSCAPE_VISIBLE_SLIDES = 2;

const CAROUSEL_SOURCE_SETS = {
  CAROUSEL_SOURCES,
  CAROUSEL_SOURCES2,
} as const;

const ACTIVE_CAROUSEL_SOURCES = CAROUSEL_SOURCE_SETS.CAROUSEL_SOURCES;

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

  const visibleSlidesNr =
    isTouch && isCompactLandscape ? COMPACT_LANDSCAPE_VISIBLE_SLIDES : device;
  const isMobileImagery = isTouch || device === VISIBLE_BY_BREAKPOINT.MOBILE;

  const slidesData = useMemo(
    () =>
      ACTIVE_CAROUSEL_SOURCES.map((entry) => ({
        id: entry.id,
        content: isMobileImagery ? entry.mobile : entry.desktop,
      })),
    [isMobileImagery],
  );

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
          <Carousel
            ref={carouselRef}
            visibleSlidesNr={visibleSlidesNr}
            slidesData={slidesData}
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
        </div>
      </section>
      <section className={appStyles.page}>
        <div className={appStyles.header}>
          <button
            className={appStyles.button}
            onClick={() => carouselRef.current?.prev()}
          >
            ‹
          </button>
          <span className={appStyles.button} style={{ cursor: "default" }}>
            {status ? `${status.currentPageIndex + 1} / ${status.pageCount}` : "—"}
          </span>
          <button
            className={appStyles.button}
            onClick={() => carouselRef.current?.next()}
          >
            ›
          </button>
        </div>
      </section>
    </main>
  );
}
