/**
 * Lifecycle of one image URL as the carousel renders it.
 */
export type ImageStatus = "loading" | "loaded" | "error";

/**
 * Immutable view of one resource handed to React via `useSyncExternalStore`.
 * `generation` increments when a retry restarts the same URL, giving the
 * on-screen `<img>` a new key so React remounts it.
 */
export interface ImageResourceSnapshot {
  readonly status: ImageStatus;
  readonly generation: number;
}

/**
 * Compact per-URL image state. It deliberately does not start browser work
 * ahead of mounted `<img>` elements; it only keeps render status and retry
 * policy consistent for duplicate URLs / cloned slides.
 */
export interface ImageResourceStore {
  getSnapshot(url: string): ImageResourceSnapshot;
  subscribe(url: string, listener: () => void): () => void;
  reportLoaded(url: string): void;
  reportError(url: string): void;
  requestRetry(url: string): void;
  prune(allowed: readonly string[]): void;
  dispose(): void;
}
