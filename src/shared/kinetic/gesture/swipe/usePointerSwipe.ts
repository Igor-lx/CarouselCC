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
  PointerSwipeEndReason,
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
  // Measured on device: a human finger INTENDING to scroll rests 100-250ms
  // on the glass before its first move — 90ms caught most real scrolls and
  // braked the ride they crossed. 250ms lets them through; a deliberate
  // catch-and-hold rests far longer (the long-press menu itself is ~500ms).
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
  /** Weighted-average gesture speed (EMA of the raw instantaneous velocity):
   * the flick decision and the release speed judge the GESTURE, not its
   * last — often decelerating — segment. */
  flickVelocity: number;
  /**
   * The velocity the CONTINUITY LAUNCH starts the ride at — `uiVelocity`'s
   * meaning, but on the flick's slow law instead of the fast per-frame EMA.
   *
   * `uiVelocity` uses `emaAlpha` (0.85), which zeroes after a ~2-frame stick.
   * Humans finishing a slow, deliberate swipe hold the finger still for exactly
   * that long before lifting — so the launch velocity collapsed to ~0 while the
   * flick memory (slow law, pause-protected) stayed high. The ride then had to
   * accelerate the full ramp from a standstill: the strip crawled out of the
   * release and only picked up speed ~300 ms later. That crawl is what the eye
   * reads as a hitch mid-ride, and no frame counter can see it — every frame is
   * delivered on time; the CURVE is what stalls.
   *
   * A momentary hold is motor noise, not an instruction to stop. This velocity
   * survives it on the same grace + half-life law the flick memory already uses;
   * a genuinely long hold still decays it, and the ride correctly starts at rest.
   */
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

/**
 * The gesture clock reads the EVENT's hardware-side timestamp, not the
 * handler's processing time: on a congested main thread events queue before
 * they are handled, which inflates dt and DEFLATES every computed velocity —
 * the slower the device, the number the flick. `timeStamp` shares the
 * `performance.now()` timebase in every modern engine; the fallback covers
 * synthetic events dispatched with a zero timestamp.
 */
const eventTime = (event: { timeStamp: number }): number =>
  event.timeStamp > 0 ? event.timeStamp : performance.now();

export function usePointerSwipe({
  hostRef: externalHostRef,
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

  // The optional drag→value binding (see PointerSwipeValueBinding). Ref-held
  // like the settings, so an inline object never re-wires anything; the
  // anchor is captured at drag activation and every write is anchor-relative.
  const valueRef = useRef(value);
  valueRef.current = value;
  const valueAnchorRef = useRef(0);

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

  // The pending catch (see `catchDelayMs`): a press only becomes a brake if
  // it outlasts the intent window. Vertical intent, a lift, or a new press
  // all void it; horizontal intent activates ahead of it.
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
        // Where the finger LANDED (not where it is now): a consumer that
        // freezes motion under the press can settle back onto the element
        // that was actually pressed.
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
      // The launch velocity is the UI-domain twin of the flick memory: same slow
      // law, so a terminal micro-hold cannot erase the speed the strip was
      // visibly carrying (see `launchVelocity` on InternalSample).
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
      // A pending catch dies with the gesture: a lift inside the window is a
      // tap, a vertical hand-off means the motion was never ours to brake.
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
      // The launch velocity gets the SAME pause law. It used to be read off the
      // fast EMA, which a two-frame hold before lift-off zeroes — and that is
      // precisely how a deliberate slow swipe ends. The ride then launched from
      // a standstill and crawled through its whole acceleration ramp.
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

      // Ownership goes to any press that OUTLASTS the catch window, whatever
      // the target — a resting finger IS the interaction ("catch the strip"),
      // and the consumer brakes its motion under it. The window is what keeps
      // a page scroll STARTED on the surface from hitching that motion: at
      // press time a catch and a scroll are indistinguishable, so the engine
      // waits `catchDelayMs` — vertical intent inside it hands the gesture to
      // the browser untouched, horizontal intent activates ahead of it, and a
      // quick lift stays a clean tap (click suppression is tied to a completed
      // DRAG, never to ownership, so interactive children keep their clicks).
      ensureCapture(target, event.pointerId);
      scheduleCatch(target, event.pointerId);
    },
    [enabled, ensureCapture, scheduleCatch, setPhase],
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

          // Re-anchor the visual origin to the finger: the deck starts its
          // follow from rest (offset 0) instead of snapping to the distance
          // accumulated during OS touch slop and input latency.
          gesture.visualStartX = event.clientX;

          const sample = createSample(event.clientX, now);
          sampleRef.current = sample;
          setPhase("dragging");
          // Value binding: anchor at the ACTIVATION read (uiOffset is ~0
          // here, so the first write continues the value seamlessly), then
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
      onPointerUp: (event) =>
        finishInteraction("release", event.clientX, eventTime(event)),
      // The browser stealing the pointer mid-press (native pan, a context
      // menu, a system gesture) — the consumer decides what an owned press
      // that ended this way MEANS (see PointerSwipeEndReason).
      onPointerCancel: (event) =>
        finishInteraction("external-cancel", event.clientX, eventTime(event)),
      onLostPointerCapture: (event) =>
        finishInteraction("external-cancel", event.clientX, eventTime(event)),
    };
  }, [enabled, finishInteraction, handlePointerDown, handlePointerMove, setHostNode]);

  return { hostProps };
}
