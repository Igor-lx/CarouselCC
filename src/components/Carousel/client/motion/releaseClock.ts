/**
 * The clock origin of a gesture-release segment. Backdates `startedAt` to
 * the physical lift-off so the commit-gap dead frames (pointerup → WAAPI
 * attach) become a small IN-PHASE skip instead of a freeze — every plan
 * consumer (track, widget, dots) pins to the same backdated clock, so the
 * skip is synchronized by construction. Clamped: an unknown or nonsensical
 * stamp falls back to `now`, and the skip never exceeds `maxBackdateMs`.
 */
export const resolveReleaseStartedAt = (
  releasedAt: number | null,
  now: number,
  maxBackdateMs: number,
): number => {
  if (releasedAt === null || !Number.isFinite(releasedAt)) return now;
  if (releasedAt >= now) return now;
  return Math.max(releasedAt, now - Math.max(0, maxBackdateMs));
};
