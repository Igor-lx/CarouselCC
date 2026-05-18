import { useCallback, useEffect, useRef, useState } from "react";

interface UseSlideImageErrorStateInput {
  imageSource: string | null;
  isActual: boolean;
}

interface UseSlideImageErrorStateResult {
  hasImageError: boolean;
  markImageLoaded: () => void;
  markImageFailed: () => void;
}

export function useSlideImageErrorState({
  imageSource,
  isActual,
}: UseSlideImageErrorStateInput): UseSlideImageErrorStateResult {
  const [hasImageError, setHasImageError] = useState(false);
  const hasImageErrorRef = useRef(false);
  const wasActualRef = useRef(Boolean(isActual));

  const updateImageError = useCallback((next: boolean) => {
    if (hasImageErrorRef.current === next) return;
    hasImageErrorRef.current = next;
    setHasImageError(next);
  }, []);

  useEffect(() => {
    updateImageError(false);
  }, [imageSource, updateImageError]);

  useEffect(() => {
    const becameActual = Boolean(isActual) && !wasActualRef.current;
    wasActualRef.current = Boolean(isActual);

    if (!becameActual || !hasImageError || !imageSource) return;

    let disposed = false;
    const probe = new Image();

    probe.onload = () => {
      if (!disposed) updateImageError(false);
    };
    probe.onerror = () => {
      if (!disposed) updateImageError(true);
    };
    probe.src = imageSource;

    return () => {
      disposed = true;
      probe.onload = null;
      probe.onerror = null;
    };
  }, [hasImageError, imageSource, isActual, updateImageError]);

  const markImageLoaded = useCallback(() => {
    updateImageError(false);
  }, [updateImageError]);

  const markImageFailed = useCallback(() => {
    updateImageError(true);
  }, [updateImageError]);

  return { hasImageError, markImageLoaded, markImageFailed };
}
