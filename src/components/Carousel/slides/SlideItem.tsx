import clsx from "clsx";
import { memo, useEffect } from "react";

import { useImageResource } from "./imageResource";
import type { SlideItemProps } from "./SlideItem.types";

/**
 * Renders one slide. The active band is derived externally via
 * `isActive` / `isActual`.
 *
 * Image content is governed by the image-resource SSOT (`useImageResource`):
 * the slide does not keep its own load/error state. It renders the `<img>`
 * while the resource is `loading` or `loaded`, reports the element's real
 * outcome back to the store, and falls back to a text placeholder on `error`.
 *
 * A slide is interactive only when it is configured interactive, a click
 * handler is provided, and — for image slides — the image has actually
 * loaded. Text slides are interactive as soon as a handler is provided.
 */
export const SlideItem = memo(function SlideItem(props: SlideItemProps) {
  const {
    slideData,
    className,
    style,
    isContentImg,
    errAltPlaceholder,
    isInteractive,
    isActive,
    isActual,
    isDataSaverEnabled,
    onSlideClick,
    ...ariaProps
  } = props;

  const imageSource =
    isContentImg && typeof slideData?.content === "string"
      ? slideData.content
      : null;

  const { status, generation, reportLoaded, reportError, requestRetry } =
    useImageResource(imageSource);

  const isImageSlide = imageSource !== null;
  const hasImageError = isImageSlide && status === "error";

  // An errored image that is currently in the active band is retried on a
  // backed-off schedule owned by the store. A successful retry flips the
  // resource back to `loading` with a new `generation`, which remounts the
  // `<img>` below and triggers a fresh fetch. The store deduplicates and caps
  // attempts, so re-running this effect on every status change is safe.
  useEffect(() => {
    if (hasImageError && isActual) requestRetry();
  }, [hasImageError, isActual, requestRetry]);

  if (!slideData) return null;

  const isContentReady = !isImageSlide || status === "loaded";
  const isClickable =
    Boolean(onSlideClick) && isInteractive && isContentReady;
  const Tag = isClickable ? "button" : "div";

  return (
    <Tag
      {...ariaProps}
      style={style}
      inert={!isActive ? true : undefined}
      data-active-zone={isActual}
      data-image-status={isImageSlide ? status : undefined}
      className={clsx(
        className.slide,
        hasImageError && className.slideError,
        !isContentImg && className.slideText,
        isClickable && className.slideInteractive,
      )}
      {...(isClickable && { type: "button" as const })}
      onClick={isClickable ? () => onSlideClick?.(slideData) : undefined}
    >
      {imageSource !== null ? (
        hasImageError ? (
          slideData.alt || errAltPlaceholder
        ) : (
          <img
            key={generation}
            src={imageSource}
            alt={slideData.alt || ""}
            draggable={false}
            decoding="async"
            // Prioritization is delegated to the platform now that the JS
            // warm-up layer is gone: the active band fetches eagerly and at
            // high priority; under reduced-data the off-band slides defer.
            loading={isDataSaverEnabled && !isActual ? "lazy" : "eager"}
            fetchPriority={isActual ? "high" : isDataSaverEnabled ? "low" : "auto"}
            onLoad={reportLoaded}
            onError={reportError}
          />
        )
      ) : (
        slideData.content
      )}
    </Tag>
  );
});
