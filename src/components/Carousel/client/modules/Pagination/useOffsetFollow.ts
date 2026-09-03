// See docs/architecture/modules.md
import { useCallback, useRef } from "react";

import {
  isDroppedFallbackFrame,
  type VisualPositionSource,
} from "../../visual-position";

/**
 * Per-frame following, in the follower's OWN offset domain.
 *
 * Both pagination strips ride the deck's position stream, and neither can read
 * it as an absolute: the widget counts in steps, the dots count in pages, and
 * the deck counts in virtual indexes that wrap. So a follow is anchored the
 * first frame it sees and advanced by the DELTA from that anchor — a grab
 * mid-ride keeps the strip exactly where it had got to instead of snapping it
 * onto the deck's own number.
 *
 * The track binding is deliberately not a third caller. It lives in the deck's
 * domain and writes the absolute position, so it has nothing to anchor and
 * subscribes once for its whole life rather than per plan.
 *
 * CONSTRAINT — the fallback frame-drop rule is read from a ref on every frame,
 * never captured in the closure. A drag that releases into the no-WAAPI path
 * changes flavour WITHOUT a new subscription, and a captured flag would leave
 * the strip painting every frame while the track sheds every Nth: the two
 * desync in exactly the case the shared rule exists to prevent.
 */
export interface OffsetFollowInput {
  /** The stream to follow; `null` from a host that wired no position source. */
  visualPosition: VisualPositionSource | null;
  /** Where the follower thinks it is. Written on every frame, dropped or not. */
  offsetRef: { current: number };
  /** The follower's live position at take-over — mid-motion, sampled from its
   * own curve rather than from the DOM. */
  readLiveOffset: () => number;
  /** Everything the follower must let go of before it paints by hand again:
   * running animations, stale write caches, the step a grab interrupts. Called
   * AFTER the live offset is read, because reading it needs that state. */
  onTakeOver: () => void;
  /** Paint one offset. Called once at take-over, then per kept frame. */
  paint: (offset: number) => void;
}

export interface OffsetFollow {
  /** Idempotent: a second `follow` plan re-aims the frame-drop rule at the new
   * flavour and otherwise leaves the running subscription alone. */
  startFollowing: (isFallback: boolean) => void;
  stopFollowing: () => void;
}

export function useOffsetFollow({
  visualPosition,
  offsetRef,
  readLiveOffset,
  onTakeOver,
  paint,
}: OffsetFollowInput): OffsetFollow {
  const unsubscribeRef = useRef<(() => void) | null>(null);
  /** The anchor: the stream's number and ours, as they were on the first frame. */
  const baseRef = useRef<{ pageOffset: number; offset: number } | null>(null);
  const isFallbackRef = useRef(false);

  // The anchor is NOT cleared here: `startFollowing` owns it, and clearing it
  // in both places is one decision made twice — the second write is provably
  // unobservable, since nothing reads the anchor between an unsubscribe and
  // the next take-over.
  const stopFollowing = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, []);

  const startFollowing = useCallback(
    (isFallback: boolean) => {
      isFallbackRef.current = isFallback;
      if (unsubscribeRef.current || !visualPosition) return;

      const start = readLiveOffset();
      onTakeOver();
      offsetRef.current = start;
      baseRef.current = null;
      paint(start);

      unsubscribeRef.current = visualPosition.subscribe(
        (frame) => {
          baseRef.current ??= {
            pageOffset: frame.pageOffset,
            offset: offsetRef.current,
          };
          const base = baseRef.current;
          const next = base.offset + (frame.pageOffset - base.pageOffset);
          // The offset advances even on a dropped frame: what is shed is the
          // PAINT, not the position, or the strip would lag by every frame the
          // rule ever dropped.
          offsetRef.current = next;

          if (isFallbackRef.current && isDroppedFallbackFrame(frame)) return;
          paint(next);
        },
        { emitCurrent: true },
      );
    },
    [offsetRef, onTakeOver, paint, readLiveOffset, visualPosition],
  );

  return { startFollowing, stopFollowing };
}
