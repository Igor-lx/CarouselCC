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
  frameAdjustedAlpha,
  getInteractiveTarget,
  resolveSwipeDirection,
} from "./internals";
import type {
  PointerSwipeConfig,
  PointerSwipeListeners,
  PointerSwipeMovePayload,
  PointerSwipePhase,
  PointerSwipeProps,
  PointerSwipeReleasePayload,
  PointerSwipeResult,
  ResolvedPointerSwipeConfig,
} from "./types";

const DEFAULT_CONFIG: ResolvedPointerSwipeConfig = {
  cooldownMs: 150,
  intentThreshold: 8,
  resistance: 0.7,
  resistanceCurvature: 0.002,
  maxVelocity: 5,
  emaAlpha: 0.7,
  quickFlickVelocity: 0.5,
  quickFlickMinOffset: 10,
  minSwipeDistance: 20,
  swipeThresholdRatio: 0.2,
};

const STYLES: CSSProperties = {
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
  width: number;
  timestamp: number;
}

const createIdleSample = (width = 0, timestamp = 0): InternalSample => ({
  rawOffset: 0,
  uiOffset: 0,
  rawVelocity: 0,
  uiVelocity: 0,
  width,
  timestamp,
});

const resolveConfig =(config?: PointerSwipeConfig): ResolvedPointerSwipeConfig => ({
  ...DEFAULT_CONFIG,
  ...config,
});

export function usePointerSwipe({
  measureRef,
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

  const [isDragging, setIsDragging] = useState(false);
  // The full pointer phase lives only in `phaseRef`; handlers read it
  // synchronously. React state tracks just `isDragging` — the one phase
  // distinction consumers react to — so a bare press/release never triggers a
  // consumer re-render.
  const phaseRef = useRef<PointerSwipePhase>("idle");

  const lockUntilRef = useRef(0);
  const allowedClickTargetRef = useRef<Element | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const sampleRef = useRef<InternalSample>(createIdleSample());
  const gestureRef = useRef({
    startX: 0,
    startY: 0,
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
    // Only the `dragging` distinction is React-reactive: a press/release that
    // never becomes a drag leaves `isDragging` false, so React bails out.
    setIsDragging((current) => {
      const next = phase === "dragging";
      return current === next ? current : next;
    });
  }, []);

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
      const uiOffset = applyResistance(rawOffset, cfg.resistance, cfg.resistanceCurvature);
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
      const width = gesture.width || sampleRef.current.width;

      gesture.lastX = currentX;
      gesture.lastTime = timestamp;
      gesture.lastOffset = uiOffset;

      return {
        rawOffset,
        uiOffset,
        rawVelocity,
        uiVelocity,
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
      const target = measureRef.current;
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
      sampleRef.current = sample;

      const wasDragging = phase === "dragging";
      const canCommit = !isCancel && wasDragging;
      const resolution = resolveSwipeDirection({
        rawOffset: sample.rawOffset,
        rawVelocity: sample.rawVelocity,
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
    [createSample, measureRef, onRelease, setPhase],
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
    const element = measureRef.current;
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
  }, [enabled, measureRef]);

  const listeners = useMemo<PointerSwipeListeners>(() => {
    if (!enabled) return {};
    return {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: (event) => finishInteraction(false, event.clientX),
      onPointerCancel: (event) => finishInteraction(true, event.clientX),
      onLostPointerCapture: (event) => finishInteraction(true, event.clientX),
      style: STYLES,
    };
  }, [enabled, finishInteraction, handlePointerDown, handlePointerMove]);

  return { isDragging, listeners };
}
