import { vi } from "vitest";

/**
 * The browser APIs the carousel touches on mount that jsdom does not ship.
 * These are the EXTERNAL boundary — the only thing this suite stubs. Nothing
 * belonging to the component is replaced.
 */

/**
 * Every query resolves to `matches`, i.e. the base tier, with real
 * add/remove so nothing leaks between cases. Deliberately dumb: anything that
 * needs media to actually CHANGE belongs in the media package's own tests,
 * which drive a full registry.
 */
export const installMatchMedia = (matches = false): void => {
  vi.stubGlobal("matchMedia", (query: string) => {
    const listeners = new Set<() => void>();
    return {
      media: query,
      matches,
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    };
  });
};

/**
 * `useViewportVisibility` constructs one unconditionally, so without this the
 * component cannot mount at all under jsdom — its sibling guards
 * `ResizeObserver` and this one does not.
 *
 * Reports the element as intersecting straight away, which is what a viewport
 * observer would say for a carousel that is on screen.
 */
export const installIntersectionObserver = (isIntersecting = true): void => {
  class StubIntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: readonly number[] = [];
    private readonly callback: IntersectionObserverCallback;

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element): void {
      this.callback(
        [{ isIntersecting, target } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }

    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
};

/** Both of the above — the usual opening line of a mount-the-component test. */
export const installCarouselBrowserEnv = (): void => {
  installMatchMedia();
  installIntersectionObserver();
};
