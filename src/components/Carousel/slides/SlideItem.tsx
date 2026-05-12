import clsx from "clsx";
import { memo, useEffect, useRef, useState } from "react";
import type { SlideItemProps } from "./SlideItem.types";

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

  const [hasImageError, setHasImageError] = useState(false);
  const wasActualRef = useRef(Boolean(isActual));

  const imageSource =
    isContentImg && typeof slideData?.content === "string"
      ? slideData.content
      : null;

  useEffect(() => {
    setHasImageError(false);
  }, [imageSource]);

  useEffect(() => {
    const becameActual = Boolean(isActual) && !wasActualRef.current;
    wasActualRef.current = Boolean(isActual);

    if (!becameActual || !hasImageError || !imageSource) return;

    let disposed = false;
    const probe = new Image();

    probe.onload = () => {
      if (!disposed) setHasImageError(false);
    };
    probe.onerror = () => {
      if (!disposed) setHasImageError(true);
    };
    probe.src = imageSource;

    return () => {
      disposed = true;
      probe.onload = null;
      probe.onerror = null;
    };
  }, [hasImageError, imageSource, isActual]);

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
            onLoad={() => setHasImageError(false)}
            onError={() => setHasImageError(true)}
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
