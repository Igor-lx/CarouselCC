/**
 * Diagnostic-only carousel performance trace.
 *
 * Enabled only in development via `?carouselTrace` or
 * `localStorage.carouselTrace === "1"`. Hot-path events stay in the in-memory
 * buffer without User Timing marks, so the trace does not add mark pressure to
 * per-RAF writes. Browser `paint` and `longtask` entries are mirrored into the
 * same buffer when the platform supports them.
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
let observersStarted = false;

const HOT_PATH_EVENTS: ReadonlySet<string> = new Set([
  "visual:sample",
  "track:write",
  "paginationWidget:write",
]);

const clearCarouselUserTiming = (): void => {
  performance
    .getEntriesByType("mark")
    .forEach((entry) => {
      if (entry.name.startsWith(MARK_PREFIX)) performance.clearMarks(entry.name);
    });
  performance
    .getEntriesByType("measure")
    .forEach((entry) => {
      if (entry.name.startsWith(MARK_PREFIX)) performance.clearMeasures(entry.name);
    });
};

const hasWindow = () => typeof window !== "undefined";

export const isCarouselTraceEnabled = (): boolean => {
  if (!import.meta.env.DEV || !hasWindow()) return false;
  const params = new URLSearchParams(window.location.search);
  return (
    params.has(TRACE_QUERY_PARAM) ||
    window.localStorage.getItem(TRACE_STORAGE_KEY) === "1"
  );
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
    clearCarouselUserTiming();
  };
  window.__CAROUSEL_TRACE_TABLE__ = () => {
    console.table(next);
  };
  startPerformanceObservers(next);
  return next;
};

const pushEntry = (buffer: CarouselTraceEntry[], entry: CarouselTraceEntry) => {
  buffer.push(entry);
  if (buffer.length > MAX_TRACE_ENTRIES) buffer.shift();
};

const startPerformanceObservers = (buffer: CarouselTraceEntry[]) => {
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
    // Optional observer types vary by browser.
  }
};

export const traceCarousel = (name: string, detail?: unknown): void => {
  if (!isCarouselTraceEnabled()) return;

  const timestamp = performance.now();
  const buffer = ensureTraceBuffer();
  pushEntry(buffer, { name, timestamp, detail });

  if (!HOT_PATH_EVENTS.has(name)) {
    try {
      performance.mark(`${MARK_PREFIX}${name}`);
    } catch {
      // User Timing is diagnostic only; tracing must never affect runtime.
    }
  }
};

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
    // Marks may be absent in partial traces.
  }
};
