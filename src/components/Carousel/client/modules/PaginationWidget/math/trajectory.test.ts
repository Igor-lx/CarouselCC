import { describe, expect, it } from "vitest";

import { buildPaginationWidgetGeometry } from "./spatialField";
import { projectDot } from "./projection";
import {
  activeTrajectoryIds,
  sampleActiveDotTrajectory,
  sampleDotTrajectory,
} from "./trajectory";

const geometry = buildPaginationWidgetGeometry(5, {
  size: 24,
  gap: 30,
  scaleFactor: 0.585,
});

const toTransform = (x: number, scale: number) =>
  `translate3d(${x}px, 0, 0) scale(${scale})`;

describe("sampleDotTrajectory", () => {
  it("produces intervals+1 keyframes whose endpoints match the projection", () => {
    const frames = sampleDotTrajectory(3, 2, 3, geometry, 24);
    expect(frames).toHaveLength(25);

    const start = projectDot(3, 2, geometry);
    const end = projectDot(3, 3, geometry);
    expect(frames[0]!.transform).toBe(toTransform(start.x, start.scale));
    expect(frames[0]!.opacity).toBe(start.opacity);
    expect(frames[24]!.transform).toBe(toTransform(end.x, end.scale));
    expect(frames[24]!.opacity).toBe(end.opacity);
  });

  it("keeps opacity within [0, 1] along the whole path", () => {
    for (const id of [-1, 0, 1, 2, 3, 4, 5]) {
      for (const frame of sampleDotTrajectory(id, 1.4, 3, geometry)) {
        expect(frame.opacity).toBeGreaterThanOrEqual(0);
        expect(frame.opacity).toBeLessThanOrEqual(1);
      }
    }
  });

  it("supports fractional starts (mid-flight retarget)", () => {
    const frames = sampleDotTrajectory(2, 1.4, 3, geometry, 10);
    const start = projectDot(2, 1.4, geometry);
    expect(frames[0]!.transform).toBe(toTransform(start.x, start.scale));
  });
});

describe("sampleActiveDotTrajectory", () => {
  it("uses the active strength as opacity", () => {
    const frames = sampleActiveDotTrajectory(3, 2, 3, geometry, 10);
    // At the start the page-3 highlight is one full step away -> strength 0;
    // at the end the offset sits exactly on page 3 -> strength 1.
    expect(frames[0]!.opacity).toBe(0);
    expect(frames[10]!.opacity).toBe(1);
  });
});

describe("activeTrajectoryIds", () => {
  it("covers every integer page the path can highlight", () => {
    expect(activeTrajectoryIds(2, 3)).toEqual([2, 3]);
    expect(activeTrajectoryIds(2.3, 4)).toEqual([2, 3, 4]);
    expect(activeTrajectoryIds(1.9, 4)).toEqual([1, 2, 3, 4]);
    expect(activeTrajectoryIds(3, 2)).toEqual([2, 3]); // backwards
    expect(activeTrajectoryIds(2.5, 2.5)).toEqual([2, 3]); // degenerate span
  });
});
