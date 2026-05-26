/**
 * Image-resource SSOT - public contract.
 *
 * The carousel loads the same image URL from up to two places: an offscreen
 * warm-up `Image()` and the on-screen `<img>` of a rendered slide. Without a
 * shared owner those would each hold their own opinion of "is this image
 * healthy", and a third probe would be needed to retry. This module makes the
 * renderable image resource a first-class single source of truth: one entry
 * per URL, one render status, one retry policy.
 *
 * Speculative preparation is modeled separately inside the store. Warm-up
 * success may promote a resource to `loaded`; warm-up failure is deliberately
 * non-authoritative, so "has this image failed" remains a derived read of a
 * real rendered `<img>` outcome, never a second render-state copy.
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

/** One atomic update of the store-owned idle preparation session. */
export interface ImagePreparationWindow {
  readonly enabled: boolean;
  readonly urls: readonly string[];
}

/**
 * The image-resource store. A framework-agnostic object (no React inside) so
 * it is trivially testable; `useImageResource` is the only bridge to React.
 */
export interface ImageResourceStore {
  /**
   * Stable snapshot for a URL. Unknown URLs read as `loading` - the optimistic
   * default, so a slide whose image has not been tracked yet still renders its
   * `<img>` and reports the real outcome back.
   */
  getSnapshot(url: string): ImageResourceSnapshot;
  /**
   * Register one live rendered owner of this URL. Returns the matching release
   * callback for unmount or URL change.
   */
  observe(url: string): () => void;
  /** Per-URL subscription for `useSyncExternalStore`. Returns an unsubscribe. */
  subscribe(url: string, listener: () => void): () => void;
  /**
   * Atomically replace the active idle preparation window. Disabling the
   * window closes the session, cancels queued decode work, and invalidates
   * stale warm-up callbacks before motion starts.
   */
  syncPreparationWindow(preparationWindow: ImagePreparationWindow): void;
  /** Record the outcome of a real, on-screen `<img>`. */
  reportLoaded(url: string): void;
  reportError(url: string): void;
  /**
   * Ask the store to retry an errored URL. Deduplicated, capped, and
   * exponentially backed off internally - the caller just expresses intent.
   */
  requestRetry(url: string): void;
  /** Drop every tracked URL outside `allowed`, releasing its heavy resources. */
  prune(allowed: readonly string[]): void;
  /**
   * Release every timer, idle callback, and DOM element. A *soft*, idempotent
   * reset — the store stays usable afterwards and re-populates on next use, so
   * a React StrictMode unmount/remount reuses the same instance. Call on real
   * unmount.
   */
  dispose(): void;
}
