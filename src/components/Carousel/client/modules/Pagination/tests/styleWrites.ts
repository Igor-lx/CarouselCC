/**
 * Counts inline-style WRITES, not style values.
 *
 * Both pagination bindings gate every per-frame DOM write behind an epsilon
 * comparison against what they last wrote, so a strip that has not visibly
 * moved costs nothing. That gate is invisible to any assertion about the DOM:
 * writing `translate3d(4px, 0, 0)` over an identical `translate3d(4px, 0, 0)`
 * leaves exactly the same document. The only observable is how many times the
 * setter ran — which is what this watches.
 *
 * Without it the whole gate can be deleted and every other test stays green,
 * while a dragged widget goes from zero writes per frame to two per dot.
 */

/** The properties the bindings paint; nothing else is watched. */
const WATCHED = ["transform", "opacity"] as const;

export type WatchedProperty = (typeof WATCHED)[number];

export interface StyleWriteLog {
  /** Writes since the last `reset`, all properties or one of them. */
  count: (property?: WatchedProperty) => number;
  /** The elements written to since the last `reset`, in first-write order. */
  written: () => HTMLElement[];
  reset: () => void;
}

/**
 * Wraps each node's own `style.transform` / `style.opacity` with a counting
 * accessor that still delegates to the real one, so existing assertions about
 * painted values keep reading the truth.
 *
 * One log per node: a second call on the same node would silently stop the
 * first log counting, so it throws instead.
 */
export const watchStyleWrites = (
  nodes: Iterable<HTMLElement>,
): StyleWriteLog => {
  const counts = new Map<WatchedProperty, number>();
  const written: HTMLElement[] = [];

  for (const node of nodes) {
    const prototype = Object.getPrototypeOf(node.style) as CSSStyleDeclaration;
    for (const property of WATCHED) {
      if (Object.getOwnPropertyDescriptor(node.style, property)) {
        throw new Error(`style writes are already watched on this node`);
      }
      // Typed explicitly: the built-in signature hands back `any`, and an
      // untyped getter here would quietly widen every read of a painted value.
      const real = Object.getOwnPropertyDescriptor(prototype, property) as
        TypedPropertyDescriptor<string> | undefined;
      if (!real?.get || !real.set) {
        throw new Error(`no accessor for style.${property} in this DOM`);
      }
      Object.defineProperty(node.style, property, {
        configurable: true,
        get: () => real.get!.call(node.style),
        set: (value: string) => {
          counts.set(property, (counts.get(property) ?? 0) + 1);
          if (!written.includes(node)) written.push(node);
          real.set!.call(node.style, value);
        },
      });
    }
  }

  return {
    count: (property) =>
      property === undefined
        ? WATCHED.reduce((sum, key) => sum + (counts.get(key) ?? 0), 0)
        : (counts.get(property) ?? 0),
    written: () => [...written],
    reset: () => {
      counts.clear();
      written.length = 0;
    },
  };
};
