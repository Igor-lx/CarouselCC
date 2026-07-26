# config/motion.ts — motion-profile shares and GO_TO geometry

Every motion is one accel/cruise/decel profile: a distance SHARE is the fraction
of travel spent ramping, the remainder is cruise. These are feel constants —
tune under UX review. Behaviour is in
[../architecture/motion.md](../architecture/motion.md).

## Repeated click
- **`REPEATED_CLICK_SPEED_MULTIPLIER`** — fast-segment peak speed, × a normal MOVE.
- **`REPEATED_CLICK_ACCELERATION_DISTANCE_SHARE`** / **`…DECELERATION…`** — its ramp shares.

## GO_TO
- **`GO_TO_TELEPORT_ENABLED`** — master switch for the far-GO_TO teleport.
- **`GO_TO_PREFLIGHT_PAGE_SPAN`** — page screens animated before the teleport.
- **`GO_TO_FINAL_APPROACH_PAGE_SPAN`** — page screens after it (a fixed calm settle).
- **`GO_TO_TELEPORT_MIN_PAGE_SPAN`** — minimum intermediate pages (endpoints
  excluded) from which a GO_TO flies; must exceed preflight + approach or it
  fires idle (diagnosed).
- **`GO_TO_ACCELERATION_DISTANCE_SHARE`** / **`…DECELERATION…`** — local to the
  first / final page screen of the jump.
- **`GO_TO_SPEED_MULTIPLIER`** — peak cruise speed, × the normal one-step MOVE speed.

## Duration-authored steps
- **`STEP_ACCELERATION_DISTANCE_SHARE`** / **`…DECELERATION…`** — click step and
  non-inertial gesture release.
- **`AUTOPLAY_ACCELERATION_DISTANCE_SHARE`** / **`…DECELERATION…`** — autoplay step
  (front-loaded).
- **`SNAP_BACK_ACCELERATION_DISTANCE_SHARE`** / **`…DECELERATION…`** — snap-back
  after a no-intent drag release.
- **`SNAP_BACK_DURATION`** — snap-back duration.
