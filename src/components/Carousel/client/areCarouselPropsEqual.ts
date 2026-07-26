import { Children, isValidElement, type ReactNode } from "react";

import type { CarouselProps } from "./public-api/types";

/**
 * The memo comparator for `<Carousel>`. Modules are passed as inline JSX
 * children, which are FRESH objects every host render — so the default shallow
 * compare never holds and any host re-render would reconcile the whole deck.
 * This compares children STRUCTURALLY (count, type, key, shallow props);
 * anything it cannot vouch for falls through to a re-render, the safe direction.
 * Do not remove it — the deck would re-reconcile on every unrelated host render.
 */

/** Props compared by identity, EXCEPT `children`: nested JSX is fresh for the
 * same reason, so a wrapper would otherwise never compare equal. Recursion is
 * bounded by the JSX the host actually wrote. */
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
    // Only ELEMENTS can be judged equivalent; text/number/null children that
    // differ are a real change, and anything exotic is not worth guessing at.
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
