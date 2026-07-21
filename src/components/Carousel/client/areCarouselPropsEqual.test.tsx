import { describe, expect, it } from "vitest";

import { areCarouselPropsEqual } from "./areCarouselPropsEqual";
import type { CarouselProps, Slide } from "./public-api/types";

/**
 * The comparator is what lets a host write modules as plain inline JSX without
 * the memo dropping on every host render. These tests pin both directions:
 * equivalent trees must hold the memo, and anything the comparison cannot
 * vouch for must fall through to a re-render.
 */

const slidesData: Slide[] = [{ id: "a", content: "a.jpg" }];

// Stand-ins for real modules: the comparator judges element identity and
// props, never what a module renders.
const Pagination = (_props: { isDotsOn?: boolean }) => null;
const Controls = (_props: { onPrevClick?: () => void }) => null;
const Diagnostic = () => null;

const props = (children: CarouselProps["children"]): CarouselProps => ({
  slidesData,
  visibleSlidesNr: 3,
  children,
});

describe("areCarouselPropsEqual", () => {
  it("holds for structurally identical inline children", () => {
    const prev = props(
      <>
        <Pagination />
        <Controls />
      </>,
    );
    const next = props(
      <>
        <Pagination />
        <Controls />
      </>,
    );
    expect(prev.children).not.toBe(next.children);
    expect(areCarouselPropsEqual(prev, next)).toBe(true);
  });

  it("re-renders when a module prop changes", () => {
    const prev = props(<Pagination />);
    const next = props(<Pagination isDotsOn={false} />);
    expect(areCarouselPropsEqual(prev, next)).toBe(false);
  });

  it("re-renders when a module is swapped for another type", () => {
    expect(
      areCarouselPropsEqual(props(<Pagination />), props(<Controls />)),
    ).toBe(false);
  });

  it("re-renders when a module is added or removed", () => {
    const one = props(<Pagination />);
    const two = props(
      <>
        <Pagination />
        <Diagnostic />
      </>,
    );
    expect(areCarouselPropsEqual(one, two)).toBe(false);
    expect(areCarouselPropsEqual(two, one)).toBe(false);
  });

  it("re-renders when a module carries a fresh inline callback", () => {
    const prev = props(<Controls onPrevClick={() => {}} />);
    const next = props(<Controls onPrevClick={() => {}} />);
    expect(areCarouselPropsEqual(prev, next)).toBe(false);
  });

  it("re-renders when the same module list is reordered", () => {
    const prev = props(
      <>
        <Pagination />
        <Controls />
      </>,
    );
    const next = props(
      <>
        <Controls />
        <Pagination />
      </>,
    );
    expect(areCarouselPropsEqual(prev, next)).toBe(false);
  });

  it("re-renders when a non-children prop changes", () => {
    const children = <Pagination />;
    expect(
      areCarouselPropsEqual(
        { ...props(children), durationStep: 1000 },
        { ...props(children), durationStep: 2000 },
      ),
    ).toBe(false);
  });

  it("re-renders when a prop is added or removed", () => {
    const children = <Pagination />;
    expect(
      areCarouselPropsEqual(props(children), {
        ...props(children),
        isAutoplayOn: true,
      }),
    ).toBe(false);
  });

  it("holds for a carousel with no children at all", () => {
    expect(
      areCarouselPropsEqual(props(undefined), props(undefined)),
    ).toBe(true);
  });

  it("sees through a wrapping fragment", () => {
    const prev = props(
      <>
        <Pagination />
        <Controls />
      </>,
    );
    const next = props(
      <>
        <Pagination />
        <Diagnostic />
      </>,
    );
    expect(areCarouselPropsEqual(prev, next)).toBe(false);
  });

  it("re-renders when a differing text child appears", () => {
    expect(areCarouselPropsEqual(props("a"), props("b"))).toBe(false);
  });
});
