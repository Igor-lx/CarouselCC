import clsx from "clsx";
import { memo } from "react";
import type { SlideItemProps } from "./SlideItem.types";
import { useSlideImageErrorState } from "./useSlideImageErrorState";

/**
 * Renders one slide. The active band is derived externally via
 * `isActive`/`isActual`. The slide becomes a `button` when it is interactive,
 * the click handler is provided, and the optional image content has loaded
 * successfully.
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
    onSlideClick,
    ...ariaProps
  } = props;

  const imageSource =
    isContentImg && typeof slideData?.content === "string"
      ? slideData.content
      : null;

  const { hasImageError, markImageFailed, markImageLoaded } =
    useSlideImageErrorState({ imageSource, isActual });

  if (!slideData) return null;

  const isClickable = Boolean(onSlideClick) && isInteractive && !hasImageError;
  const Tag = isClickable ? "button" : "div";

  return (
    <Tag
      {...ariaProps}
      style={style}
      inert={!isActive ? true : undefined}
      data-active-zone={isActual}
      className={clsx(
        className.slide,
        hasImageError && className.slideError,
        !isContentImg && className.slideText,
        isClickable && className.slideInteractive,
      )}
      {...(isClickable && { type: "button" as const })}
      onClick={isClickable ? () => onSlideClick?.(slideData) : undefined}
    >
      {isContentImg && typeof slideData.content === "string" ? (
        !hasImageError ? (
          <img
            src={slideData.content}
            alt={slideData.alt || ""}
            draggable={false}
            onLoad={markImageLoaded}
            onError={markImageFailed}
          />
        ) : (
          slideData.alt || errAltPlaceholder
        )
      ) : (
        slideData.content
      )}
    </Tag>
  );
});
