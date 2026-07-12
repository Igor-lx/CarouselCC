import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  applyResistance,
  calculateEma,
  clampMagnitude,
  decayedVelocity,
  dominantMagnitude,
  frameAdjustedAlpha,
  getInteractiveTarget,
  pauseDecayedVelocity,
  resolveSwipeDirection,
} from "./internals/index";
import type {
  PointerSwipeConfig,
  PointerSwipeHostProps,
  PointerSwipeMovePayload,
  PointerSwipePhase,
  PointerSwipeProps,
  PointerSwipeReleasePayload,
  PointerSwipeResult,
  ResolvedPointerSwipeConfig,
} from "./types";

/**
 * The engine's own out-of-the-box tuning. A consumer config is merged OVER
 * these per field, so passing nothing (or a partial object) always yields a
 * fully working engine.
 */
export const POINTER_SWIPE_DEFAULTS: ResolvedPointerSwipeConfig = {
  cooldownMs: 150,
  intentThreshold: 8,
  resistance: 0.7,
  resistanceCurvature: 0.002,
  maxVelocity: 5,
  emaAlpha: 0.7,
  quickFlickVelocity: 0.5,
  quickFlickMinOffset: 10,
  flickVelocityAlpha: 0.35,
  flickPauseGraceMs: 120,
  flickVelocityHalfLifeMs: 250,
  minSwipeDistance: 20,
  swipeThresholdRatio: 0.2,
};

/** Styles the engine needs on its host element to own horizontal touch input. */
const HOST_STYLES: CSSProperties = {
  touchAction: "pan-y",
  userSelect: "none",
  WebkitUserSelect: "none",
  overscrollBehaviorX: "contain",
  WebkitTapHighlightColor: "transparent",
};

interface InternalSample {
  rawOffset: number;
  uiOffset: number;
  rawVelocity: number;
  uiVelocity: number;
  /** Weighted-average gesture speed (EMA of the raw instantaneous velocity):
   * the flick decision and the release speed judge the GESTURE, not its
   * last — often decelerating — segment. */
  flickVelocity: number;
  width: number;
  timestamp: number;
}

const createIdleSample = (width = 0, timestamp = 0): InternalSample => ({
  rawOffset: 0,
  uiOffset: 0,
  rawVelocity: 0,
  uiVelocity: 0,
  flickVelocity: 0,
  width,
  timestamp,
});

const resolveConfig = (config?: PointerSwipeConfig): ResolvedPointerSwipeConfig => ({
  ...POINTER_SWIPE_DEFAULTS,
  ...config,
});

export function usePointerSwipe({
  hostRef: externalHostRef,
  enabled = true,
  config,
  onPressStart,
  onDragStart,
  onDragMove,
  onRelease,
}: PointerSwipeProps): PointerSwipeResult {
  const settings = useMemo(() => resolveConfig(config), [config]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // The full pointer phase is internal and synchronous. Consumers own their
  // public dragging state through the callbacks, so pointer bookkeeping never
  // re-renders React by itself.
  const phaseRef = useRef<PointerSwipePhase>("idle");

  const lockUntilRef = useRef(0);
  const allowedClickTargetRef = useRef<Element | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const sampleRef = useRef<InternalSample>(createIdleSample());
  const gestureRef = useRef({
    startX: 0,
    startY: 0,
    /** Anchor for the VISUAL offset. Starts at `startX`, re-anchored to the
     * finger the moment the drag activates: the OS suppresses the first
     * touch moves (touch slop) and queues input, so by activation the finger
     * is already 20–40px away from `startX` — measuring the visual offset
     * from there would teleport the deck on the first drag frame. Commit and
     * flick judgment keep the full `startX`-based travel (`rawOffset`). */
    visualStartX: 0,
    lastX: 0,
    lastTime: 0,
    lastOffset: 0,
    pointerId: null as number | null,
    hasCapture: false,
    isActivated: false,
    width: 0,
  });

  const setPhase = useCallback((phase: PointerSwipePhase) => {
    phaseRef.current = phase;
  }, []);

  // The engine owns the host element itself: `hostProps.ref` below is the
  // ONLY way an element becomes the host, so the listeners, the host styles
  // and the native suppressors land on the same element BY CONSTRUCTION —
  // there is no wiring contract a consumer could get wrong. The ref-state
  // pair exists because the native-listener effect must re-run when the host
  // node itself changes, not only when `enabled` flips.
  const hostElementRef = useRef<HTMLElement | null>(null);
  const [hostElement, setHostElement] = useState<HTMLElement | null>(null);

  const setHostNode = useCallback(
    (node: HTMLElement | null) => {
      hostElementRef.current = node;
      setHostElement(node);
      // Forward to the consumer's own ref (optional): the consumer often
      // needs the same element for its own concerns.
      if (typeof externalHostRef === "function") externalHostRef(node);
      else if (externalHostRef) externalHostRef.current = node;
    },
    [externalHostRef],
  );

  const ensureCapture = useCallback((target: HTMLElement, pointerId: number) => {
    const gesture = gestureRef.current;
    if (gesture.hasCapture) return;
    try {
      target.setPointerCapture(pointerId);
      gesture.hasCapture = true;
    } catch {
      // capture lost between events — ignore
    }
  }, []);

  const activateOwnership = useCallback(
    (target: HTMLElement, pointerId: number) => {
      const gesture = gestureRef.current;
      ensureCapture(target, pointerId);
      if (!gesture.isActivated) {
        gesture.isActivated = true;
        onPressStart?.();
      }
    },
    [ensureCapture, onPressStart],
  );

  const createSample = useCallback(
    (currentX: number, timestamp: number): InternalSample => {
      const gesture = gestureRef.current;
      const cfg = settingsRef.current;
      const rawOffset = currentX - gesture.startX;
      const uiOffset = applyResistance(
        currentX - gesture.visualStartX,
        cfg.resistance,
        cfg.resistanceCurvature,
      );
      const dt = Math.max(1, timestamp - gesture.lastTime);
      const rawVelocity = clampMagnitude(
        (currentX - gesture.lastX) / dt,
        cfg.maxVelocity,
      );
      const instantUiVelocity = clampMagnitude(
        (uiOffset - gesture.lastOffset) / dt,
        cfg.maxVelocity,
      );
      const uiVelocity = clampMagnitude(
        calculateEma(
          sampleRef.current.uiVelocity,
          instantUiVelocity,
          frameAdjustedAlpha(cfg.emaAlpha, dt),
        ),
        cfg.maxVelocity,
      );
      const flickVelocity = clampMagnitude(
        calculateEma(
          sampleRef.current.flickVelocity,
          rawVelocity,
          frameAdjustedAlpha(cfg.flickVelocityAlpha, dt),
        ),
        cfg.maxVelocity,
      );
      const width = gesture.width || sampleRef.current.width;

      gesture.lastX = currentX;
      gesture.lastTime = timestamp;
      gesture.lastOffset = uiOffset;

      return {
        rawOffset,
        uiOffset,
        rawVelocity,
        uiVelocity,
        flickVelocity,
        width,
        timestamp,
      };
    },
    [],
  );

  const toMovePayload = useCallback(
    (sample: InternalSample): PointerSwipeMovePayload => ({
      uiOffset: sample.uiOffset,
    }),
    [],
  );

  const finishInteraction = useCallback(
    (isCancel = false, currentX?: number) => {
      const target = hostElementRef.current;
      const now = performance.now();
      const phase = phaseRef.current;
      const gesture = gestureRef.current;

      if (gesture.hasCapture && gesture.pointerId !== null && target) {
        try {
          target.releasePointerCapture(gesture.pointerId);
        } catch {
          // already released — ignore
        }
        gesture.hasCapture = false;
      }

      if (phase === "idle" || phase === "cooldown") return;

      if (!gesture.isActivated) {
        allowedClickTargetRef.current = null;
        setPhase("idle");
        sampleRef.current = createIdleSample(target?.offsetWidth ?? 0, now);
        gesture.lastOffset = 0;
        gesture.pointerId = null;
        gesture.isActivated = false;
        gesture.width = 0;
        return;
      }

      const hasMovementOnRelease =
        typeof currentX === "number" && currentX !== gesture.lastX;
      // The flick memory survives a lift-off hold on the human pause law
      // (grace + half-life) — NOT the per-frame EMA decay below, which zeroes
      // a fast gesture after a ~2-frame stick. Captured before createSample
      // so a last-instant micro-twitch cannot wipe the gesture's speed.
      const pausedFlickVelocity = pauseDecayedVelocity(
        sampleRef.current.flickVelocity,
        now - sampleRef.current.timestamp,
        settingsRef.current.flickPauseGraceMs,
        settingsRef.current.flickVelocityHalfLifeMs,
      );
      const sample: InternalSample = hasMovementOnRelease
        ? createSample(currentX, now)
        : {
            ...sampleRef.current,
            rawVelocity: decayedVelocity(
              sampleRef.current.rawVelocity,
              settingsRef.current.emaAlpha,
              now - sampleRef.current.timestamp,
            ),
            uiVelocity: decayedVelocity(
              sampleRef.current.uiVelocity,
              settingsRef.current.emaAlpha,
              now - sampleRef.current.timestamp,
            ),
            width: gesture.width || target?.offsetWidth || sampleRef.current.width,
            timestamp: now,
          };
      sample.flickVelocity = dominantMagnitude(
        sample.flickVelocity ?? 0,
        pausedFlickVelocity,
      );
      sampleRef.current = sample;

      const wasDragging = phase === "dragging";
      const canCommit = !isCancel && wasDragging;
      const resolution = resolveSwipeDirection({
        rawOffset: sample.rawOffset,
        rawVelocity: sample.rawVelocity,
        flickVelocity: sample.flickVelocity,
        width: sample.width,
        config: settingsRef.current,
        canCommit,
      });

      const payload: PointerSwipeReleasePayload = {
        uiOffset: sample.uiOffset,
        direction: resolution.direction,
        pointerReleaseVelocity: resolution.pointerReleaseVelocity,
        uiReleaseVelocity: sample.uiVelocity,
      };

      onRelease?.(payload);

      if (wasDragging) {
        allowedClickTargetRef.current = null;
        lockUntilRef.current = now + settingsRef.current.cooldownMs;
        setPhase("cooldown");

        if (timeoutRef.current !== null) {
          window.clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = window.setTimeout(() => {
          allowedClickTargetRef.current = null;
          setPhase("idle");
          timeoutRef.current = null;
        }, settingsRef.current.cooldownMs);
      } else {
        allowedClickTargetRef.current = null;
        setPhase("idle");
      }

      sampleRef.current = createIdleSample(target?.offsetWidth ?? 0, now);
      gesture.lastOffset = 0;
      gesture.pointerId = null;
      gesture.isActivated = false;
      gesture.width = 0;
    },
    [createSample, onRelease, setPhase],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      const now = performance.now();
      if (!enabled || !event.isPrimary || event.pointerType !== "touch" || event.button !== 0) {
        return;
      }

      const target = event.currentTarget as HTMLElement;
      const interactive = getInteractiveTarget(event.target, target);

      if (interactive && now < lockUntilRef.current) {
        allowedClickTargetRef.current = interactive;
        return;
      }

      allowedClickTargetRef.current = null;

      if (now < lockUntilRef.current) return;

      gestureRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        visualStartX: event.clientX,
        lastX: event.clientX,
        lastTime: now,
        lastOffset: 0,
        pointerId: event.pointerId,
        hasCapture: false,
        isActivated: false,
        width: target.offsetWidth,
      };
      sampleRef.current = createIdleSample(gestureRef.current.width, now);
      setPhase("press");

      if (interactive) {
        ensureCapture(target, event.pointerId);
      } else {
        activateOwnership(target, event.pointerId);
      }
    },
    [activateOwnership, enabled, ensureCapture, setPhase],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      const phase = phaseRef.current;
      if (phase === "idle" || phase === "cooldown") return;
      if (event.pointerId !== gestureRef.current.pointerId) return;

      const gesture = gestureRef.current;
      const now = performance.now();
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      const cfg = settingsRef.current;

      if (phase === "press") {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        if (absX > cfg.intentThreshold || absY > cfg.intentThreshold) {
          if (absY > absX) {
            finishInteraction(true);
            return;
          }

          if (event.cancelable) event.preventDefault();
          activateOwnership(event.currentTarget as HTMLElement, event.pointerId);

          // Re-anchor the visual origin to the finger: the deck starts its
          // follow from rest (offset 0) instead of snapping to the distance
          // accumulated during OS touch slop and input latency.
          gesture.visualStartX = event.clientX;

          const sample = createSample(event.clientX, now);
          sampleRef.current = sample;
          setPhase("dragging");
          const payload = toMovePayload(sample);
          onDragStart?.(payload);
          onDragMove?.(payload);
        }
        return;
      }

      if (event.cancelable) event.preventDefault();

      const sample = createSample(event.clientX, now);
      sampleRef.current = sample;
      onDragMove?.(toMovePayload(sample));
    },
    [
      activateOwnership,
      createSample,
      finishInteraction,
      onDragMove,
      onDragStart,
      setPhase,
      toMovePayload,
    ],
  );

  useEffect(() => {
    const element = hostElement;
    if (!element || !enabled) return;

    const suppressClick = (event: MouseEvent) => {
      if (performance.now() >= lockUntilRef.current) return;
      const allowed = allowedClickTargetRef.current;
      const isAllowed =
        allowed instanceof Element &&
        event.target instanceof Node &&
        allowed.contains(event.target);

      if (isAllowed) {
        allowedClickTargetRef.current = null;
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    const suppressTouchMove = (event: TouchEvent) => {
      if (!event.cancelable) return;
      if (phaseRef.current === "dragging") {
        event.preventDefault();
        return;
      }
      if (phaseRef.current !== "press") return;
      const touch = event.touches[0];
      if (!touch) return;

      const dx = touch.clientX - gestureRef.current.startX;
      const dy = touch.clientY - gestureRef.current.startY;
      const threshold = settingsRef.current.intentThreshold;
      if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy)) {
        event.preventDefault();
      }
    };

    element.addEventListener("click", suppressClick, { capture: true });
    element.addEventListener("touchmove", suppressTouchMove, { passive: false });

    return () => {
      element.removeEventListener("click", suppressClick, { capture: true });
      element.removeEventListener("touchmove", suppressTouchMove);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [enabled, hostElement]);

  // One inseparable bundle: the ref that MAKES an element the host travels
  // together with the listeners and the required styles, so they cannot be
  // applied to different elements. `ref` is present even while disabled —
  // re-enabling and the forwarded consumer ref keep working.
  const hostProps = useMemo<PointerSwipeHostProps>(() => {
    if (!enabled) return { ref: setHostNode };
    return {
      ref: setHostNode,
      style: HOST_STYLES,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: (event) => finishInteraction(false, event.clientX),
      onPointerCancel: (event) => finishInteraction(true, event.clientX),
      onLostPointerCapture: (event) => finishInteraction(true, event.clientX),
    };
  }, [enabled, finishInteraction, handlePointerDown, handlePointerMove, setHostNode]);

  return { hostProps };
}
