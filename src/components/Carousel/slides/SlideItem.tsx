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
