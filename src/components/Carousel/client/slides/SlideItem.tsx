import clsx from "clsx";
import { memo, useEffect, useRef } from "react";

import { SLIDE_PORTRAIT_MEDIA_CONDITION } from "../config";
import { resolveRenderedImageSrc } from "../domain";
import { useImageResource } from "./imageResource";
import { useOrientationSwapVeil } from "./useOrientationSwapVeil";
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
    isResponsiveImagesOn,
    errAltPlaceholder,
    isInteractive,
    isActive,
    isActual,
    isDataSaverEnabled,
    imageResourceStore,
    imageSizes,
    onSlideClick,
    ...ariaProps
  } = props;

  // The rendered (and store-keyed) URL: canonical content in responsive
  // mode, the LARGEST candidate across ALL sets in single-set mode — one
  // rule shared with the store retention (see resolveRenderedImageSrc).
  const imageSource =
    isContentImg && slideData
      ? resolveRenderedImageSrc(
          slideData,
          isResponsiveImagesOn,
          SLIDE_PORTRAIT_MEDIA_CONDITION,
        )
      : null;

  const { status, generation, reportLoaded, reportError, requestRetry } =
    useImageResource(imageSource, imageResourceStore);

  const isImageSlide = imageSource !== null;
  const hasImageError = isImageSlide && status === "error";

  // Orientation-swap veil: masks the stale-crop repaint window on rotation
  // (see useOrientationSwapVeil). Applies only while a bitmap is on screen.
  const imgRef = useRef<HTMLImageElement | null>(null);
  const isReorienting = useOrientationSwapVeil({
    imgRef,
    // Without the ResponsiveImages module there is no art-directed source to
    // swap on rotation — the veil stays inert.
    isBitmapShown: isResponsiveImagesOn && isImageSlide && status === "loaded",
  });

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

  // Render-only responsive sources (see `Slide.image`). The browser selects the
  // concrete asset; identity stays `content`. `sizes` is only meaningful with a
  // `srcSet`, so a plain `<img src>` slide carries none.
  const image = slideData.image;
  // The whole responsive surface is gated by the module's presence: without
  // it a slide is a plain <img src> of the largest candidate — no sources,
  // no srcSet, no sizes.
  const sources = isResponsiveImagesOn ? image?.sources ?? [] : [];
  const isResponsive =
    isResponsiveImagesOn && (image?.srcSet !== undefined || sources.length > 0);
  const resolvedSizes = image?.sizes ?? imageSizes;

  const imageNode =
    imageSource !== null ? (
      <img
        // Outside `<picture>` the `<img>` carries the retry key (a retry then
        // remounts it); inside `<picture>` the key lives on the wrapper.
        key={sources.length === 0 ? generation : undefined}
        ref={imgRef}
        data-reorienting={isReorienting || undefined}
        src={imageSource}
        srcSet={isResponsiveImagesOn ? image?.srcSet : undefined}
        sizes={isResponsive ? resolvedSizes : undefined}
        alt={slideData.alt || ""}
        draggable={false}
        decoding="async"
        // Prioritization is delegated to the platform: the active band fetches
        // eagerly and at high priority; under reduced-data the off-band slides
        // defer. Responsive selection (resolution / orientation crop) is the
        // browser's via `srcSet`/`<source>`.
        loading={isDataSaverEnabled && !isActual ? "lazy" : "eager"}
        fetchPriority={isActual ? "high" : isDataSaverEnabled ? "low" : "auto"}
        onLoad={reportLoaded}
        onError={reportError}
      />
    ) : null;

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
        ) : sources.length > 0 ? (
          <picture key={generation}>
            {sources.map((source) => (
              <source
                key={`${source.media}:${source.srcSet}`}
                media={source.media}
                srcSet={source.srcSet}
                sizes={source.sizes ?? resolvedSizes}
                type={source.type}
              />
            ))}
            {imageNode}
          </picture>
        ) : (
          imageNode
        )
      ) : (
        slideData.content
      )}
    </Tag>
  );
});
