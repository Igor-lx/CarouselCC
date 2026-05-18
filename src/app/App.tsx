import { useMemo, useState } from "react";

import appStyles from "./App.module.scss";
import { CAROUSEL_SOURCES, CAROUSEL_SOURCES2 } from "./carouselData";
import { useCompactLandscape } from "./useCompactLandscape";
import { useBreakpoint, useIsTouchDevice } from "../shared";
import Carousel, { type Slide } from "../components/Carousel";
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

const ACTIVE_CAROUSEL_SOURCES = CAROUSEL_SOURCE_SETS.CAROUSEL_SOURCES2;

const openSlide = (slide: Slide) => {
  window.open(String(slide.content), "_blank");
};

export default function App() {
  const { toggleTheme, theme } = useTheme();
  const isTouch = useIsTouchDevice();
  const isCompactLandscape = useCompactLandscape();

  const [isAutoplay, setIsAutoplay] = useState(false);
  const [isInteractive, setIsInteractive] = useState(true);

  const device = useBreakpoint(VISIBLE_BY_BREAKPOINT);

  const visibleSlidesNr =
    isTouch && isCompactLandscape ? COMPACT_LANDSCAPE_VISIBLE_SLIDES : device;
  const useMobileImages = isTouch || device === VISIBLE_BY_BREAKPOINT.MOBILE;

  const slidesData = useMemo(
    () =>
      ACTIVE_CAROUSEL_SOURCES.map((entry) => ({
        id: entry.id,
        content: useMobileImages ? entry.mobile : entry.desktop,
      })),
    [useMobileImages],
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
            visibleSlidesNr={visibleSlidesNr}
            slidesData={slidesData}
            isAuto={isAutoplay}
            isPaginationOn
            isInteractive={isInteractive}
            durationAutoplay={5000}
            durationStep={7000}
            durationJump={450}
            intervalAutoplay={3000}
            isPagePaddingOn
            isTouchDevice={isTouch}
            onSlideClick={openSlide}
          >
            {isTouch ? <PaginationWidget /> : <Pagination />}
            <Controls />
            <Diagnostic />
          </Carousel>
        </div>
      </section>
      <section className={appStyles.page} />
    </main>
  );
}
