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
  getDragIgnoreTarget,
  getInteractiveTarget,
  pauseDecayedVelocity,
  resolveSwipeDirection,
} from "./internals/index";
import type {
  PointerSwipeConfig,
  PointerSwipeEndReason,
  PointerSwipeHostProps,
  PointerSwipeMovePayload,
  PointerSwipePhase,
  PointerSwipeProps,
  PointerSwipeReleasePayload,
  PointerSwipeResult,
  ResolvedPointerSwipeConfig,
} from "./types";

// See ./types.ts for field meanings and ../README.md for recognition internals.
/** Out-of-the-box tuning; a partial consumer `config` merges over it per field. */
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
  // 250ms: lets a real scroll (rests 100-250ms) through, catches a hold (~500ms
  // long-press). See ../README.md § Recognition internals.
  catchDelayMs: 250,
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
  /** Weighted-average gesture speed (raw-velocity EMA): the flick decision
   * judges the GESTURE, not its last (decelerating) segment. */
  flickVelocity: number;
  /** Continuity-launch speed on the flick's slow law (not the fast per-frame
   * EMA). See ../README.md § Recognition internals (the ride-crawl fix). */
  launchVelocity: number;
  width: number;
  timestamp: number;
}

const createIdleSample = (width = 0, timestamp = 0): InternalSample => ({
  rawOffset: 0,
  uiOffset: 0,
  rawVelocity: 0,
  uiVelocity: 0,
  flickVelocity: 0,
  launchVelocity: 0,
  width,
  timestamp,
});

const resolveConfig = (config?: PointerSwipeConfig): ResolvedPointerSwipeConfig => ({
  ...POINTER_SWIPE_DEFAULTS,
  ...config,
});

/** Event hardware-time, not handler time — else a congested thread deflates
 * every velocity. See ../README.md § Recognition internals. */
const eventTime = (event: { timeStamp: number }): number =>
  event.timeStamp > 0 ? event.timeStamp : performance.now();

export function usePointerSwipe({
  hostRef: externalHostRef,
  surfaceRef,
  enabled = true,
  config,
  value,
  onPressStart,
  onDragStart,
  onDragMove,
  onRelease,
}: PointerSwipeProps): PointerSwipeResult {
  const settings = useMemo(() => resolveConfig(config), [config]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Ref-held drag→value binding: anchor captured at activation, writes anchor-relative.
  const valueRef = useRef(value);
  valueRef.current = value;
  const valueAnchorRef = useRef(0);

  // Pointer phase is internal + synchronous — never re-renders by itself.
  const phaseRef = useRef<PointerSwipePhase>("idle");

  const lockUntilRef = useRef(0);
  const allowedClickTargetRef = useRef<Element | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const sampleRef = useRef<InternalSample>(createIdleSample());
  const gestureRef = useRef({
    startX: 0,
    startY: 0,
    /** Visual-offset anchor; re-anchored to the finger at activation. See
     * ../README.md § Recognition internals (visual re-anchor). */
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

  // ref+state pair: the native-listener effect must re-run when the host NODE
  // changes, not only when `enabled` flips.
  const hostElementRef = useRef<HTMLElement | null>(null);
  const [hostElement, setHostElement] = useState<HTMLElement | null>(null);

  const setHostNode = useCallback(
    (node: HTMLElement | null) => {
      hostElementRef.current = node;
      setHostElement(node);
      // Forward to the consumer's optional ref.
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

  // Pending catch: a press becomes a brake only if it outlasts the window.
  // See ../README.md § Recognition internals (the catch window).
  const catchTimerRef = useRef<number | null>(null);

  const clearCatchTimer = useCallback(() => {
    if (catchTimerRef.current !== null) {
      window.clearTimeout(catchTimerRef.current);
      catchTimerRef.current = null;
    }
  }, []);

  const activateOwnership = useCallback(
    (target: HTMLElement, pointerId: number) => {
      clearCatchTimer();
      const gesture = gestureRef.current;
      ensureCapture(target, pointerId);
      if (!gesture.isActivated) {
        gesture.isActivated = true;
        // Where the finger LANDED (not where it is now) — for settling back
        // onto the pressed element.
        onPressStart?.({ pressClientX: gesture.startX });
      }
    },
    [clearCatchTimer, ensureCapture, onPressStart],
  );

  const scheduleCatch = useCallback(
    (target: HTMLElement, pointerId: number) => {
      clearCatchTimer();
      const cfg = settingsRef.current;
      if (cfg.catchDelayMs <= 0) {
        activateOwnership(target, pointerId);
        return;
      }
      catchTimerRef.current = window.setTimeout(() => {
        catchTimerRef.current = null;
        const gesture = gestureRef.current;
        if (phaseRef.current !== "press" || gesture.pointerId !== pointerId) {
          return;
        }
        activateOwnership(target, pointerId);
      }, cfg.catchDelayMs);
    },
    [activateOwnership, clearCatchTimer],
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
      // Launch velocity: UI-domain twin of the flick memory (same slow law).
      const launchVelocity = clampMagnitude(
        calculateEma(
          sampleRef.current.launchVelocity,
          instantUiVelocity,
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
        launchVelocity,
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
    (
      endReason: PointerSwipeEndReason,
      currentX?: number,
      timestamp?: number,
    ) => {
      const isCancel = endReason !== "release";
      // A pending catch dies with the gesture (a lift inside the window is a tap).
      clearCatchTimer();
      const target = hostElementRef.current;
      const now = timestamp ?? performance.now();
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
      // Flick + launch memory survive a lift-off hold on the pause law (grace +
      // half-life), captured BEFORE the terminal sample so a last-instant twitch
      // can't wipe them. See ../README.md § Recognition internals.
      const pausedFlickVelocity = pauseDecayedVelocity(
        sampleRef.current.flickVelocity,
        now - sampleRef.current.timestamp,
        settingsRef.current.flickPauseGraceMs,
        settingsRef.current.flickVelocityHalfLifeMs,
      );
      const pausedLaunchVelocity = pauseDecayedVelocity(
        sampleRef.current.launchVelocity,
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
      sample.launchVelocity = dominantMagnitude(
        sample.launchVelocity ?? 0,
        pausedLaunchVelocity,
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
        endReason,
        direction: resolution.direction,
        pointerReleaseVelocity: resolution.pointerReleaseVelocity,
        uiReleaseVelocity: sample.uiVelocity,
        launchVelocity: sample.launchVelocity,
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
    [clearCatchTimer, createSample, onRelease, setPhase],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      const now = eventTime(event);
      if (!enabled || !event.isPrimary || event.pointerType !== "touch" || event.button !== 0) {
        return;
      }

      const target = event.currentTarget as HTMLElement;
      const interactive = getInteractiveTarget(event.target, target);

      // Not the engine's surface → handed straight back (click marked allowed).
      // Two ways to declare it: outside `surfaceRef`, or `data-drag-ignore="true"`.
      // See ../README.md § Principle.
      const surface = surfaceRef?.current ?? null;
      const offSurface =
        surface && event.target instanceof Node && !surface.contains(event.target);
      const dragIgnored = getDragIgnoreTarget(event.target, target);
      if (offSurface || dragIgnored) {
        allowedClickTargetRef.current =
          dragIgnored ??
          interactive ??
          (event.target instanceof Element ? event.target : null);
        return;
      }

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

      // Ownership goes to any press that outlasts the catch window (a resting
      // finger IS the "catch the strip" interaction). See ../README.md § Recognition internals.
      ensureCapture(target, event.pointerId);
      scheduleCatch(target, event.pointerId);
    },
    [enabled, ensureCapture, scheduleCatch, setPhase, surfaceRef],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      const phase = phaseRef.current;
      if (phase === "idle" || phase === "cooldown") return;
      if (event.pointerId !== gestureRef.current.pointerId) return;

      const gesture = gestureRef.current;
      const now = eventTime(event);
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      const cfg = settingsRef.current;

      if (phase === "press") {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        if (absX > cfg.intentThreshold || absY > cfg.intentThreshold) {
          if (absY > absX) {
            finishInteraction("vertical-scroll", undefined, now);
            return;
          }

          if (event.cancelable) event.preventDefault();
          activateOwnership(event.currentTarget as HTMLElement, event.pointerId);

          // Re-anchor the visual origin to the finger (see README § visual re-anchor).
          gesture.visualStartX = event.clientX;

          const sample = createSample(event.clientX, now);
          sampleRef.current = sample;
          setPhase("dragging");
          // Value binding: anchor at the activation read (uiOffset ~0 here),
          // write before the callbacks so they observe the fresh value.
          const binding = valueRef.current;
          if (binding) {
            valueAnchorRef.current = binding.read();
            binding.write(valueAnchorRef.current + sample.uiOffset);
          }
          const payload = toMovePayload(sample);
          onDragStart?.(payload);
          onDragMove?.(payload);
        }
        return;
      }

      if (event.cancelable) event.preventDefault();

      const sample = createSample(event.clientX, now);
      sampleRef.current = sample;
      valueRef.current?.write(valueAnchorRef.current + sample.uiOffset);
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
      if (eventTime(event) >= lockUntilRef.current) return;
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
      clearCatchTimer();
    };
  }, [clearCatchTimer, enabled, hostElement]);

  // One inseparable bundle (ref + listeners + styles); `ref` present even while
  // disabled so re-enabling and the forwarded consumer ref keep working.
  const hostProps = useMemo<PointerSwipeHostProps>(() => {
    if (!enabled) return { ref: setHostNode };
    return {
      ref: setHostNode,
      style: HOST_STYLES,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: (event) =>
        finishInteraction("release", event.clientX, eventTime(event)),
      // Browser stole the pointer mid-press (see README § End reasons).
      onPointerCancel: (event) =>
        finishInteraction("external-cancel", event.clientX, eventTime(event)),
      onLostPointerCapture: (event) =>
        finishInteraction("external-cancel", event.clientX, eventTime(event)),
    };
  }, [enabled, finishInteraction, handlePointerDown, handlePointerMove, setHostNode]);

  return { hostProps };
}
