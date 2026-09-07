/**
 * FORK of `shared/engines/gesture/tests/configContract.test.tsx`, byte-identical apart from this note.
 *
 * `kinetic/internal/` carries its own copies of the gesture and motion
 * engines so the folder can be lifted out whole. The copies are allowed to
 * drift, which is exactly why a guard on the original says nothing about this
 * one: same assertions, different module.
 */

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  POINTER_SWIPE_DEFAULTS,
  usePointerSwipe,
} from "../swipe/usePointerSwipe";
import type { PointerSwipeConfig } from "../swipe/types";

/**
 * What the engine accepts, and what it refuses at the door.
 *
 * Inputs are caller-owned and the engine does not police them — with one
 * exception, and this file is that exception's whole guarantee. A setting that
 * is not a finite number stops being distinguishable from a deliberate one the
 * moment it enters the arithmetic: every comparison with `NaN` is false, so a
 * broken tuning reads as "the flick was not fast enough". The deck keeps
 * working, quietly without inertia, and the mistake outlives everyone who could
 * have fixed it. Refusing at the door is the last point where the value is
 * still a setting rather than a measurement.
 *
 * The other half — what counts as a SANE number — is deliberately not here.
 * That is the consumer's judgement (in this repository, the constants audit),
 * and an engine copied into another project has no opinion on it.
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const mount = (config: PointerSwipeConfig) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  const Host = () => {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const { hostProps } = usePointerSwipe({
      config,
      surfaceRef: hostRef,
    });
    return <div {...hostProps} ref={hostRef} />;
  };

  act(() => {
    root?.render(<Host />);
  });
};

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("the engine's door", () => {
  it("mounts on a config it has no complaint about", () => {
    expect(() => {
      mount({ resistance: 0.5, maxVelocity: 4 });
    }).not.toThrow();
  });

  it("mounts on no config at all — the defaults are its own", () => {
    expect(() => {
      mount({});
    }).not.toThrow();
  });

  // One assertion per field would be a list that falls behind the defaults.
  // Driving it from the defaults means a setting added tomorrow is covered the
  // day it appears — the same reason the check itself iterates rather than
  // lists.
  it("refuses a non-finite value in ANY setting, and names the field", () => {
    for (const field of Object.keys(POINTER_SWIPE_DEFAULTS)) {
      for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(
          () => {
            mount({ [field]: bad });
          },
          `${field} = ${String(bad)}`,
        ).toThrow(new RegExp(field));
      }
    }
  });

  // The distinction the whole decision rests on: a number outside its range is
  // still a number and stays the caller's business. Refusing it here would make
  // this blank the arbiter of taste in every project that copies it.
  it("accepts a number outside its range — that is not the door's business", () => {
    expect(() => {
      mount({ resistance: 4, maxVelocity: -1, cooldownMs: -50 });
    }).not.toThrow();
  });
});
