// The memo comparator for <Carousel>. Inline JSX children are fresh objects every
// host render, so a structural compare (count/type/key/shallow props) is needed to
// stop unrelated host re-renders reconciling the whole deck. Do NOT remove it.
// See docs/architecture/overview.md
import { Children, isValidElement, type ReactNode } from "react";

import type { CarouselProps } from "./public-api/types";

/** Props compared by identity, except `children` (fresh JSX, compared structurally). */
function shallowEqualProps(
  a: Readonly<Record<string, unknown>>,
  b: Readonly<Record<string, unknown>>,
): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    if (Object.is(a[key], b[key])) continue;
    if (key === "children") {
      if (!areChildrenEquivalent(a[key] as ReactNode, b[key] as ReactNode)) {
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

function areChildrenEquivalent(a: ReactNode, b: ReactNode): boolean {
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
