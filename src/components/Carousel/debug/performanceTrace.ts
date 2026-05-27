/**
 * Diagnostic-only carousel performance trace.
 *
 * Opt-in: this module records timestamps for selected carousel events while
 * the page is loaded with `?carouselTrace` in the query string OR while
 * `localStorage.carouselTrace === "1"`. When neither is set, every public
 * function in this file is a no-op apart from a couple of cheap branches.
 * Production builds short-circuit via `import.meta.env.DEV` so the trace
 * code is reachable only in development.
 *
 * What it does when enabled
 * -------------------------
 * - Pushes entries to `window.__CAROUSEL_TRACE__` (capped at
 *   `MAX_TRACE_ENTRIES` to bound memory; oldest entries are dropped first).
 * - Writes a matching `performance.mark()` for every non-hot-path event,
 *   so Chrome DevTools' Performance tab shows the marks inline with the
 *   browser's own paint / longtask records.
 * - Hot-path events (`visual:sample`, `track:write`,
 *   `paginationWidget:write`) are recorded to the in-memory buffer only,
 *   *without* a `performance.mark`, to keep User-Timing overhead off the
 *   per-RAF write path.
 * - Starts a single `PerformanceObserver` for `longtask` and `paint`
 *   entries so frame-budget overruns and browser paint events land in the
 *   same buffer as carousel-internal events. This is the cheapest way to
 *   correlate a click-induced commit with the actual paint that follows.
 *
 * How to read it
 * --------------
 *   localStorage.carouselTrace = "1"; location.reload();
 *   // interact with the carousel
 *   __CAROUSEL_TRACE_TABLE__();   // pretty-prints the buffer
 *   __CAROUSEL_TRACE_RESET__();   // clears it for another run
 *
 * The User-Timing marks (named `carousel:<event>`) are visible in
 * DevTools › Performance › Timings, and can be turned into measures via
 * `measureCarouselTrace(name, startMark, endMark)`.
 */

export interface CarouselTraceEntry {
  name: string;
  timestamp: number;
  detail?: unknown;
}

declare global {
  interface Window {
    __CAROUSEL_TRACE__?: CarouselTraceEntry[];
    __CAROUSEL_TRACE_RESET__?: () => void;
    __CAROUSEL_TRACE_TABLE__?: () => void;
  }
}

const MAX_TRACE_ENTRIES = 5_000;
const TRACE_QUERY_PARAM = "carouselTrace";
const TRACE_STORAGE_KEY = "carouselTrace";
const MARK_PREFIX = "carousel:";

/**
 * Hot-path events that fire per-RAF (or close to it). Recording them to the
 * in-memory buffer is acceptable; pushing a `performance.mark` for each one
 * would inflate the User-Timing log and skew its own performance profile.
 */
const HOT_PATH_EVENTS: ReadonlySet<string> = new Set([
  "visual:sample",
  "track:write",
  "paginationWidget:write",
]);

let observersStarted = false;

const hasWindow = (): boolean => typeof window !== "undefined";

export const isCarouselTraceEnabled = (): boolean => {
  if (!import.meta.env.DEV || !hasWindow()) return false;
  const params = new URLSearchParams(window.location.search);
  return (
    params.has(TRACE_QUERY_PARAM) ||
    window.localStorage.getItem(TRACE_STORAGE_KEY) === "1"
  );
};

const pushEntry = (buffer: CarouselTraceEntry[], entry: CarouselTraceEntry) => {
  buffer.push(entry);
  if (buffer.length > MAX_TRACE_ENTRIES) buffer.shift();
};

/**
 * Wires a single `PerformanceObserver` to capture browser-side `longtask`
 * and `paint` entries alongside carousel-internal events. Observer types
 * vary by browser; failures are silent because this is diagnostic-only.
 */
const startPerformanceObservers = (buffer: CarouselTraceEntry[]): void => {
  if (observersStarted || typeof PerformanceObserver === "undefined") return;
  observersStarted = true;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        pushEntry(buffer, {
          name: `browser:${entry.entryType}:${entry.name}`,
          timestamp: entry.startTime,
          detail: { duration: entry.duration },
        });
      }
    });
    observer.observe({ entryTypes: ["longtask", "paint"] });
  } catch {
    // Observer types vary by browser. Diagnostic only: failure is harmless.
  }
};

const ensureTraceBuffer = (): CarouselTraceEntry[] => {
  const current = window.__CAROUSEL_TRACE__;
  if (current) {
    startPerformanceObservers(current);
    return current;
  }

  const next: CarouselTraceEntry[] = [];
  window.__CAROUSEL_TRACE__ = next;
  window.__CAROUSEL_TRACE_RESET__ = () => {
    next.length = 0;
    performance.clearMarks();
    performance.clearMeasures();
  };
  window.__CAROUSEL_TRACE_TABLE__ = () => {
    console.table(next);
  };
  startPerformanceObservers(next);
  return next;
};

/**
 * Record a carousel-internal event. No-op when the trace is disabled, and
 * fully tree-shaken from production builds because of the `import.meta.env.DEV`
 * gate inside `isCarouselTraceEnabled`.
 */
export const traceCarousel = (name: string, detail?: unknown): void => {
  if (!isCarouselTraceEnabled()) return;

  const timestamp = performance.now();
  const buffer = ensureTraceBuffer();
  pushEntry(buffer, { name, timestamp, detail });

  if (!HOT_PATH_EVENTS.has(name)) {
    try {
      performance.mark(`${MARK_PREFIX}${name}`);
    } catch {
      // User-Timing is best-effort; tracing must never affect runtime.
    }
  }
};

/**
 * Convenience: emit a User-Timing measure between two previously-marked
 * trace events. Useful for spanning e.g. `motion:layoutEffect` ➝
 * `motion:start` in the DevTools timeline.
 */
export const measureCarouselTrace = (
  name: string,
  startMark: string,
  endMark: string,
): void => {
  if (!isCarouselTraceEnabled()) return;

  try {
    performance.measure(
      `${MARK_PREFIX}${name}`,
      `${MARK_PREFIX}${startMark}`,
      `${MARK_PREFIX}${endMark}`,
    );
  } catch {
    // Marks may be absent in partial traces; safe to ignore.
  }
};
