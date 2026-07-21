import { Children, isValidElement, type ReactNode } from "react";

import type { CarouselProps } from "./public-api/types";

/**
 * The memo comparator for `<Carousel>`.
 *
 * WHY IT EXISTS. Modules are passed the natural way — as inline JSX children:
 *
 *   <Carousel …>
 *     <Pagination />
 *     <Controls />
 *   </Carousel>
 *
 * JSX creates FRESH element objects on every render of the host, so the
 * default shallow comparison sees a new `children` prop every time and the
 * memo never holds. Any host re-render — a status label, a theme toggle,
 * anything — then reconciles the whole deck, and on a slow device that lands
 * as a stutter in the frame where a ride starts. Making hosts hand-memoise
 * their children (an array with manual keys) works but punishes ordinary,
 * correct React for a problem the component can solve once, for everyone.
 *
 * So children are compared STRUCTURALLY: same count, same element types, same
 * keys, shallow-equal props. Equivalent trees skip the render; anything the
 * comparison cannot vouch for (a changed module prop, a swapped module, an
 * inline callback, a non-element child) falls through to a re-render, which
 * is always the safe direction.
 */

/**
 * Props are compared by identity, EXCEPT `children` — nested JSX is a fresh
 * object for exactly the same reason the top level is, so a wrapper (a
 * fragment, a module that wraps content) would otherwise never compare equal
 * and would defeat the whole comparator. The recursion is bounded by the JSX
 * the host literally wrote, and walking it is strictly cheaper than the
 * reconciliation it avoids.
 */
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
