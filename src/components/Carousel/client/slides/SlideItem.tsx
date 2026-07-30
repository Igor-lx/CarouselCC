// See docs/architecture/slides.md
import clsx from "clsx";
import { memo, useEffect, useRef } from "react";

import { resolveRenderedImageSrc } from "../domain";
import { useImageResource } from "./imageResource";
import { useOrientationSwapVeil } from "./useOrientationSwapVeil";
import type { SlideItemProps } from "./SlideItem.types";

export const SlideItem = memo(function SlideItem(props: SlideItemProps) {
  const {
    slideData,
    className,
    style,
    isContentImg,
    isResponsiveImagesOn,
    errAltPlaceholder,
    isInteractiveOn,
    isActive,
    isActual,
    isFetchOn,
    isDataSaverEnabled,
    imageResourceStore,
    imageSizes,
    viewportSignature,
    onSlideClick,
    ...ariaProps
  } = props;

  // The rendered (and store-keyed) URL — one rule shared with retention.
  const imageSource =
    isContentImg && slideData
      ? resolveRenderedImageSrc(slideData, isResponsiveImagesOn)
      : null;

  const { status, generation, reportLoaded, reportError, requestRetry } =
    useImageResource(imageSource, imageResourceStore);

  const isImageSlide = imageSource !== null;
  const hasImageError = isImageSlide && status === "error";

  // Orientation-swap veil — only while a bitmap is on screen.
  const imgRef = useRef<HTMLImageElement | null>(null);
  const isReorienting = useOrientationSwapVeil({
    imgRef,
    // No ResponsiveImages module → no source to swap → veil inert.
    isBitmapShown: isResponsiveImagesOn && isImageSlide && status === "loaded",
    viewportSignature,
  });

  // Retry an in-band errored image (store owns backoff/cap/dedup; see slides.md).
  useEffect(() => {
    if (hasImageError && isActual) requestRetry();
  }, [hasImageError, isActual, requestRetry]);

  if (!slideData) return null;

  const isContentReady = !isImageSlide || status === "loaded";
  const isClickable =
    Boolean(onSlideClick) && isInteractiveOn && isContentReady;
  const Tag = isClickable ? "button" : "div";

  // Render-only responsive sources, gated by the module's presence (see slides.md).
  const image = slideData.image;
  const sources = isResponsiveImagesOn ? image?.sources ?? [] : [];
  const isResponsive =
    isResponsiveImagesOn && (image?.srcSet !== undefined || sources.length > 0);
  const resolvedSizes = image?.sizes ?? imageSizes;

  const imageNode =
    imageSource !== null ? (
      <img
        // Outside `<picture>` the `<img>` carries the retry key; inside, the wrapper does.
        key={sources.length === 0 ? generation : undefined}
        ref={imgRef}
        data-reorienting={isReorienting || undefined}
        // Slow-load reveal (see Carousel.module.scss): fade the complete bitmap
        // in instead of the progressive stripe paint. Responsive module only.
        data-awaiting-image={
          isResponsiveImagesOn && status === "loading" ? "true" : undefined
        }
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
        ) : !isFetchOn ? // Bandwidth gate: the buffer waits out the visible band and the
        // ride (see `useSlideFetchReach`). Sources are withheld by NOT MOUNTING the
        // element — a mounted `<img>` with no `src` inside a `<picture>` would
        // still resolve a candidate from the `<source>`s and fetch it, and a
        // src-less `<img>` renders its `alt` text as visible content.
        null : sources.length > 0 ? (
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
