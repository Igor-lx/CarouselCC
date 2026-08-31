import { describe, expect, it } from "vitest";

import {
  buildProfile,
  createMotionProfile,
  sampleMotionProfile,
} from "../profile/profile";

describe("createMotionProfile", () => {
  it("produces a positive duration and ordered zones for a normal accel/cruise/decel", () => {
    const profile = createMotionProfile({
      distance: 300,
      startSpeed: 0,
      peakSpeed: 1,
      endSpeed: 0,
      accelerationDistanceShare: 0.3,
      decelerationDistanceShare: 0.3,
    });
    expect(profile.duration).toBeGreaterThan(0);
    expect(profile.zones.length).toBe(3);
    // zones are laid out contiguously in distance-progress space.
    expect(profile.zones[0]!.startDistanceProgress).toBeCloseTo(0);
    expect(
      profile.zones[profile.zones.length - 1]!.endDistanceProgress,
    ).toBeCloseTo(1);
  });

  // A share that is not a number would otherwise build a zone of NaN
  // duration, and one such zone makes the whole profile's duration NaN —
  // the ride then never settles. The zone is skipped instead.
  it("skips a zone whose share is not a number", () => {
    const profile = createMotionProfile({
      distance: 300,
      startSpeed: 0,
      peakSpeed: 1,
      endSpeed: 0,
      accelerationDistanceShare: Number.NaN,
      decelerationDistanceShare: 0.3,
    });
    expect(profile.duration).toBeGreaterThan(0);
    expect(Number.isFinite(profile.duration)).toBe(true);
  });

  it("drops zero-share zones (pure deceleration profile keeps one zone)", () => {
    const profile = createMotionProfile({
      distance: 300,
      startSpeed: 1,
      peakSpeed: 1,
      endSpeed: 0,
      accelerationDistanceShare: 0,
      decelerationDistanceShare: 1,
    });
    expect(profile.zones.length).toBe(1);
    expect(profile.duration).toBeGreaterThan(0);
  });

  it("raises the resolved peak to cover start/end speeds", () => {
    // peakSpeed below startSpeed must not invert the profile.
    const profile = createMotionProfile({
      distance: 100,
      startSpeed: 5,
      peakSpeed: 1,
      endSpeed: 0,
      accelerationDistanceShare: 0,
      decelerationDistanceShare: 1,
    });
    expect(profile.duration).toBeGreaterThan(0);
    expect(Number.isFinite(profile.duration)).toBe(true);
  });
});

describe("sampleMotionProfile", () => {
  const profile = buildProfile({
    from: 0,
    to: 300,
    startSpeed: 0,
    peakSpeed: 1,
    endSpeed: 0,
    accelerationDistanceShare: 0.3,
    decelerationDistanceShare: 0.3,
  });

  it("starts at zero distance-progress", () => {
    const sample = sampleMotionProfile(profile, 0, 300);
    expect(sample.distanceProgress).toBeCloseTo(0);
  });

  it("completes at full distance-progress once elapsed reaches the duration", () => {
    const sample = sampleMotionProfile(profile, profile.duration, 300);
    expect(sample.distanceProgress).toBe(1);
  });

  it("clamps an over-elapsed sample to full progress", () => {
    const sample = sampleMotionProfile(profile, profile.duration * 5, 300);
    expect(sample.distanceProgress).toBe(1);
  });

  it("advances monotonically through the segment", () => {
    let previous = -1;
    for (let t = 0; t <= profile.duration; t += profile.duration / 12) {
      const { distanceProgress } = sampleMotionProfile(profile, t, 300);
      expect(distanceProgress).toBeGreaterThanOrEqual(previous);
      previous = distanceProgress;
    }
  });
});

/**
 * The degenerate inputs, which is where a curve stops being a curve.
 *
 * Zero distance, zero duration, no zones — every one of them is a division
 * waiting to happen, and the result of that division is not an error but a
 * `NaN` that travels: into the sampled position, into the track transform, and
 * onto the screen as a deck that has simply vanished. The guards exist so the
 * answer is a legal degenerate ride instead. None of them was exercised.
 */
describe("createMotionProfile — degenerate inputs", () => {
  const shares = {
    accelerationDistanceShare: 0.3,
    decelerationDistanceShare: 0.3,
  };

  it("a curve with no distance has a duration of zero, not a NaN", () => {
    const profile = createMotionProfile({
      distance: 0,
      peakSpeed: 1,
      startSpeed: 0,
      endSpeed: 0,
      ...shares,
    });
    expect(profile.duration).toBe(0);
    expect(Number.isNaN(profile.duration)).toBe(false);
  });

  it("a curve with no zones has a duration of zero", () => {
    // Every share zero: nothing to accelerate over, nothing to cruise.
    const profile = createMotionProfile({
      distance: 0,
      peakSpeed: 0,
      startSpeed: 0,
      endSpeed: 0,
      accelerationDistanceShare: 0,
      decelerationDistanceShare: 0,
    });
    expect(profile.duration).toBe(0);
  });
});

describe("sampleMotionProfile — degenerate inputs", () => {
  const flat = { duration: 0, endSpeed: 2, zones: [] };

  it("a profile with no zones reads as finished, at its end speed", () => {
    // Finished, not frozen: the caller pins the target and moves on. Answering
    // "0 progress" here would leave the deck parked at its origin forever.
    expect(sampleMotionProfile(flat, 0, 100)).toEqual({
      distanceProgress: 1,
      speed: 2,
    });
  });

  it("a profile with zero duration reads as finished, whatever the elapsed", () => {
    const zoned = {
      duration: 0,
      endSpeed: 0,
      zones: [
        {
          startTime: 0,
          duration: 0,
          startSpeed: 0,
          endSpeed: 0,
          startDistanceProgress: 0,
          endDistanceProgress: 1,
        },
      ],
    };
    expect(sampleMotionProfile(zoned, 5, 100).distanceProgress).toBe(1);
  });

  it("a sample over a zero distance lands on the zone's end, not on NaN", () => {
    // `localDistance / distance` is the division in question. Without the
    // guard this returns NaN and the track transform becomes "translate(NaNpx)".
    const profile = createMotionProfile({
      distance: 10,
      peakSpeed: 5,
      startSpeed: 0,
      endSpeed: 0,
      accelerationDistanceShare: 0.3,
      decelerationDistanceShare: 0.3,
    });
    const sample = sampleMotionProfile(profile, profile.duration / 2, 0);
    expect(Number.isNaN(sample.distanceProgress)).toBe(false);
    expect(sample.distanceProgress).toBeGreaterThanOrEqual(0);
    expect(sample.distanceProgress).toBeLessThanOrEqual(1);
  });

  it("an elapsed exactly at the duration is already finished", () => {
    // The boundary: at `elapsed === duration` the ride is over, not in its
    // final zone. Read the other way, the last frame samples a zone-local
    // progress of exactly 1 and re-derives what the guard already knows.
    const profile = createMotionProfile({
      distance: 10,
      peakSpeed: 5,
      startSpeed: 0,
      endSpeed: 0,
      accelerationDistanceShare: 0.3,
      decelerationDistanceShare: 0.3,
    });
    expect(sampleMotionProfile(profile, profile.duration, 10)).toEqual({
      distanceProgress: 1,
      speed: profile.endSpeed,
    });
  });
});

describe("the profile's own shape", () => {
  const ride = () =>
    createMotionProfile({
      distance: 300,
      peakSpeed: 1,
      startSpeed: 0,
      endSpeed: 0,
      accelerationDistanceShare: 0.3,
      decelerationDistanceShare: 0.3,
    });

  it("eases speed symmetrically — half a zone in, half its speed change", () => {
    // The smoothstep is what makes a ride read as motion rather than as a
    // ramp: symmetric about its middle, flat at both ends. Half-way through a
    // zone it has delivered exactly half the change, and any other curve
    // through those same endpoints shows up as a lurch at the start or a
    // long crawl at the end while the endpoints still look right.
    const profile = ride();
    const zone = profile.zones[0]!;
    const sample = sampleMotionProfile(
      profile,
      zone.startTime + zone.duration / 2,
      300,
    );
    expect(sample.speed).toBeCloseTo((zone.startSpeed + zone.endSpeed) / 2, 12);
  });

  it("a build that produced no zones at all still has a duration", () => {
    // Reachable: shares that are not numbers make every zone unbuildable, and
    // the duration is read off the LAST zone — off an empty list it is a read
    // of `undefined.startTime`, thrown from inside a render.
    const profile = createMotionProfile({
      distance: 100,
      peakSpeed: 1,
      startSpeed: 0,
      endSpeed: 0,
      accelerationDistanceShare: Number.NaN,
      decelerationDistanceShare: Number.NaN,
    });
    expect(profile.zones).toHaveLength(0);
    expect(profile.duration).toBe(0);
  });
});

describe("sampleMotionProfile — profiles that do not describe a ride", () => {
  it("reads a NaN duration as finished rather than sampling into NaN", () => {
    // Not hypothetical: speeds that are not numbers build zones of NaN
    // duration, and one is enough to make the profile's duration NaN. The
    // comparison is written `!(duration > 0)` precisely so NaN takes this
    // branch — read it as `duration <= 0` and every sample below is NaN, which
    // reaches WAAPI as a keyframe offset and voids the whole animation.
    const profile = createMotionProfile({
      distance: 100,
      peakSpeed: Number.NaN,
      startSpeed: Number.NaN,
      endSpeed: Number.NaN,
      accelerationDistanceShare: 0.3,
      decelerationDistanceShare: 0.3,
    });
    expect(Number.isNaN(profile.duration)).toBe(true);
    expect(sampleMotionProfile(profile, 10, 100).distanceProgress).toBe(1);
  });

  it("reads an empty profile as finished whenever it is asked", () => {
    // Nothing forces `duration` and `zones` to agree — a duration with no
    // zones is as buildable as any other profile, and past the guard there is
    // no zone to find: the fallback reads the last element of an empty list
    // and the sample throws from inside a render.
    //
    // Before the clock starts, too: a segment can be pinned slightly ahead (a
    // release hands over the gesture's timestamp, not the call's).
    const empty = { duration: 100, endSpeed: 2, zones: [] };
    expect(sampleMotionProfile(empty, 50, 100)).toEqual({
      distanceProgress: 1,
      speed: 2,
    });
    expect(sampleMotionProfile(empty, -100, 100)).toEqual({
      distanceProgress: 1,
      speed: 2,
    });
  });

  it("reads a profile with no duration as finished before its clock too", () => {
    // A zero-distance ride: three zones, every one of them instant. Judged
    // frame by frame instead of by the guard, a sample from before the start
    // lands in the FIRST of those zones and reports the ride 30% done — the
    // deck parks a third of the way to a page it already sits on.
    const stillborn = createMotionProfile({
      distance: 0,
      peakSpeed: 1,
      startSpeed: 0,
      endSpeed: 0,
      accelerationDistanceShare: 0.3,
      decelerationDistanceShare: 0.3,
    });
    expect(stillborn.duration).toBe(0);
    expect(sampleMotionProfile(stillborn, -5, 100).distanceProgress).toBe(1);
  });

  it("samples from the last zone when the zones fall short of the duration", () => {
    // The zones are the source of truth for the shape, the duration for the
    // clock, and nothing forces them to agree. Where they do not, the tail of
    // the ride sits past every zone: it reads as the end of the last one.
    const short = {
      duration: 100,
      endSpeed: 3,
      zones: [
        {
          startTime: 0,
          duration: 40,
          startSpeed: 1,
          endSpeed: 3,
          startDistanceProgress: 0,
          endDistanceProgress: 0.5,
        },
      ],
    };
    expect(sampleMotionProfile(short, 80, 100)).toEqual({
      distanceProgress: 0.5,
      speed: 3,
    });
  });

  it("treats a zone that takes no time as instantly complete", () => {
    // An instant zone has no progress to interpolate: its local progress is 1
    // by definition. Compute it instead and it is a division by zero — the
    // speed becomes NaN, and the distance it covers reads as zero, so the
    // ride starts from the wrong point of the curve.
    const instant = {
      duration: 100,
      endSpeed: 0,
      zones: [
        {
          startTime: 0,
          duration: 0,
          startSpeed: 0,
          endSpeed: 5,
          startDistanceProgress: 0,
          endDistanceProgress: 0.25,
        },
        {
          startTime: 0,
          duration: 100,
          startSpeed: 5,
          endSpeed: 0,
          startDistanceProgress: 0.25,
          endDistanceProgress: 1,
        },
      ],
    };
    expect(sampleMotionProfile(instant, 0, 100)).toEqual({
      distanceProgress: 0.25,
      speed: 5,
    });
  });
});
