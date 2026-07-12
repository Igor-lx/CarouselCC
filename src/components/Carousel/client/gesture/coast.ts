/**
 * The COAST BRIDGE math — one pure frame step. Between lift-off and the
 * runner's post-commit takeover the track keeps travelling at the release's
 * visual velocity, so motion never stops during the commit gap (the gesture
 * twin of §4.2, where a click retarget is carried by the previous WAAPI
 * animation). The bridge never overshoots: crossing the ride target clamps
 * the frame AT the target and reports `done`.
 */
export interface CoastFrameInput {
  position: number;
  /** Signed virtual-units-per-ms velocity (aligned with the target). */
  velocity: number;
  dtMs: number;
  targetVirtualIndex: number;
}

export interface CoastFrame {
  position: number;
  done: boolean;
}

export const resolveCoastFrame = ({
  position,
  velocity,
  dtMs,
  targetVirtualIndex,
}: CoastFrameInput): CoastFrame => {
  if (velocity === 0) return { position, done: true };
  if (!(dtMs > 0)) return { position, done: false };

  const next = position + velocity * dtMs;
  const directionBefore = Math.sign(targetVirtualIndex - position);
  const directionAfter = Math.sign(targetVirtualIndex - next);
  if (directionBefore === 0 || directionAfter !== directionBefore) {
    return { position: targetVirtualIndex, done: true };
  }
  return { position: next, done: false };
};
