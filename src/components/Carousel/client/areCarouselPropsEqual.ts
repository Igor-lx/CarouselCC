// The memo comparator for <Carousel>. Inline JSX children are fresh objects every
// host render, so a structural compare (count/type/key/shallow props) is needed to
// stop unrelated host re-renders reconciling the whole deck. Do NOT remove it.
// See docs/architecture/overview.md
import { Children, isValidElement, type ReactNode } from "react";

import type { CarouselProps } from "./public-api/types";

/**
 * Nesting the comparison walks past: deeper than this and a "changed" verdict
 * is returned instead. Slot modules are flat by design (a module is a leaf that
 * reads context), so this is a fuse, not a policy — and it fails SAFE: the
 * worst outcome is one re-render the deck would have skipped, never a skipped
 * re-render of a real change.
 */
const MAX_CHILD_COMPARE_DEPTH = 4;

/** Props compared by identity, except `children` (fresh JSX, compared structurally). */
function shallowEqualProps(
  a: Readonly<Record<string, unknown>>,
  b: Readonly<Record<string, unknown>>,
  depth: number,
): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    if (Object.is(a[key], b[key])) continue;
    if (key === "children") {
      if (!areChildrenEquivalent(a[key] as ReactNode, b[key] as ReactNode, depth)) {
        return false;
      }
      continue;
    }
    return false;
  }
  return true;
}

/** Flattened child list — `Children.forEach` unwraps arrays for us. */
const toChildList = (children: ReactNode): ReactNode[] => {
  const list: ReactNode[] = [];
  Children.forEach(children, (child) => {
    list.push(child);
  });
  return list;
};

function areChildrenEquivalent(
  a: ReactNode,
  b: ReactNode,
  depth = 0,
): boolean {
  if (depth >= MAX_CHILD_COMPARE_DEPTH) return false;

  const listA = toChildList(a);
  const listB = toChildList(b);
  if (listA.length !== listB.length) return false;

  for (let i = 0; i < listA.length; i += 1) {
    const prev = listA[i];
    const next = listB[i];
    if (Object.is(prev, next)) continue;
    // Only elements can be judged equivalent; differing text/exotic = real change.
    if (!isValidElement(prev) || !isValidElement(next)) return false;
    if (prev.type !== next.type || prev.key !== next.key) return false;
    if (
      !shallowEqualProps(
        prev.props as Record<string, unknown>,
        next.props as Record<string, unknown>,
        depth + 1,
      )
    ) {
      return false;
    }
  }
  return true;
}

export const areCarouselPropsEqual = (
  prev: Readonly<CarouselProps>,
  next: Readonly<CarouselProps>,
): boolean => {
  const prevKeys = Object.keys(prev);
  if (prevKeys.length !== Object.keys(next).length) return false;

  for (const key of prevKeys) {
    if (key === "children") continue;
    if (
      !Object.is(
        (prev as Record<string, unknown>)[key],
        (next as Record<string, unknown>)[key],
      )
    ) {
      return false;
    }
  }

  return areChildrenEquivalent(prev.children, next.children);
};
