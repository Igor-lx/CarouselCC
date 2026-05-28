import { useEffect } from "react";

interface UseTrackRasterWarmupInput {
  enabled: boolean;
  version: string;
  warmCompositorLayer: () => void;
}

type ScheduledIdle = {
  kind: "idle" | "timeout";
  id: number;
};

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const requestIdle = (callback: () => void): ScheduledIdle | null => {
  if (typeof window === "undefined") return null;
  const target = window as IdleWindow;
  if (typeof target.requestIdleCallback === "function") {
    return {
      kind: "idle",
      id: target.requestIdleCallback(callback, { timeout: 250 }),
    };
  }
  return {
    kind: "timeout",
    id: target.setTimeout(callback, 96),
  };
};

const cancelIdle = (scheduled: ScheduledIdle | null): void => {
  if (scheduled === null || typeof window === "undefined") return;
  const target = window as IdleWindow;
  if (scheduled.kind === "idle") {
    target.cancelIdleCallback?.(scheduled.id);
    return;
  }
  target.clearTimeout(scheduled.id);
};

export function useTrackRasterWarmup({
  enabled,
  version,
  warmCompositorLayer,
}: UseTrackRasterWarmupInput): void {
  useEffect(() => {
    if (!enabled) return;

    let frameId: number | null = null;
    const idleId = requestIdle(() => {
      if (typeof window === "undefined") return;
      frameId = window.requestAnimationFrame(warmCompositorLayer);
    });

    return () => {
      cancelIdle(idleId);
      if (frameId !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [enabled, version, warmCompositorLayer]);
}
