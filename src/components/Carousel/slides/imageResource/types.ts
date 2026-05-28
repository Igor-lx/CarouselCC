/**
 * Image-resource SSOT — public contract.
 *
 * The carousel makes the renderable image resource a first-class single source
 * of truth: one entry per URL, one render status, one retry policy. A rendered
 * `<img>` reports its real outcome back, which is authoritative — it is what
 * the user actually sees. "Has this image failed" is therefore a derived read
 * of that outcome, never a second render-state copy.
 */

/** Lifecycle of one image URL as the carousel renders it. */
export type ImageStatus = "loading" | "loaded" | "error";

/**
 * Immutable view of one resource handed to React via `useSyncExternalStore`.
 * The store keeps the same frozen object until something actually changes, so
 * React's snapshot comparison is a referential no-op between renders.
 */
export interface ImageResourceSnapshot {
  readonly status: ImageStatus;
  /**
   * Bumped every time a retry restarts the resource. Consumers use it as the
   * `key` of the on-screen `<img>`: a same-URL retry then remounts the element
   * and forces a fresh fetch (React would otherwise skip an unchanged `src`).
   */
  readonly generation: number;
}

/**
 * The image-resource store. A framework-agnostic object (no React inside) so
 * it is trivially testable; `useImageResource` is the only bridge to React.
 */
export interface ImageResourceStore {
  /**
   * Stable snapshot for a URL. Unknown URLs read as `loading` — the optimistic
   * default, so a slide whose image has not been tracked yet still renders its
   * `<img>` and reports the real outcome back.
   */
  getSnapshot(url: string): ImageResourceSnapshot;
  /** Per-URL subscription for `useSyncExternalStore`. Returns an unsubscribe. */
  subscribe(url: string, listener: () => void): () => void;
  /** Record the outcome of a real, on-screen `<img>`. */
  reportLoaded(url: string): void;
  reportError(url: string): void;
  /**
   * Ask the store to retry an errored URL. Deduplicated, capped, and
   * exponentially backed off internally — the caller just expresses intent.
   */
  requestRetry(url: string): void;
  /** Drop every tracked URL outside `allowed`, releasing its retry timer. */
  prune(allowed: readonly string[]): void;
  /**
   * Release every retry timer and empty the maps. A *soft*, idempotent reset —
   * the store stays usable afterwards and re-populates on next use, so a React
   * StrictMode unmount/remount reuses the same instance. Call on real unmount.
   */
  dispose(): void;
}
