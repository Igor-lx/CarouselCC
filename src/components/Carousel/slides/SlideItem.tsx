import clsx from "clsx";
import { memo, useEffect } from "react";

import { useImageResource } from "./imageResource";
import type { SlideItemProps } from "./SlideItem.types";

export const SlideItem = memo(function SlideItem(props: SlideItemProps) {
  const {
    slideData,
    className,
    style,
    isContentImg,
    imageResourceStore,
    imageSizes,
    isDataSaverEnabled,
    errAltPlaceholder,
    isInteractive,
    isActive,
    isActual,
    onSlideClick,
    ...ariaProps
  } = props;

  const imageSource =
    isContentImg && typeof slideData?.content === "string"
      ? slideData.content
      : null;

  const { status, generation, reportLoaded, reportError, requestRetry } =
    useImageResource(imageSource, imageResourceStore);

  const isImageSlide = imageSource !== null;
  const hasImageError = isImageSlide && status === "error";

  useEffect(() => {
    if (hasImageError && isActual) requestRetry();
  }, [hasImageError, isActual, requestRetry]);

  if (!slideData) return null;

  const isContentReady = !isImageSlide || status === "loaded";
  const isClickable =
    Boolean(onSlideClick) && isInteractive && isContentReady;
  const Tag = isClickable ? "button" : "div";
  const image = slideData.image;
  const resolvedSizes = image?.sizes ?? imageSizes;
  const sources = image?.sources ?? [];
  const imageNode =
    imageSource !== null ? (
      <img
        key={sources.length === 0 ? generation : undefined}
        src={imageSource}
        srcSet={image?.srcSet}
        sizes={resolvedSizes}
        alt={slideData.alt || ""}
        draggable={false}
        decoding="async"
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
