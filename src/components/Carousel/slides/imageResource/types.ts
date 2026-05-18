/**
 * Image-resource SSOT — public contract.
 *
 * The carousel loads the same image URL from up to two places: an offscreen
 * warm-up `Image()` (preload) and the on-screen `<img>` of a rendered slide.
 * Without a shared owner those would each hold their own opinion of "is this
 * image healthy", and a third probe would be needed to retry. This module
 * makes the *renderable image resource* a first-class single source of truth:
 * one entry per URL, one render status, one retry policy. Warm-up success may
 * promote a resource to `loaded`; warm-up failure is deliberately
 * non-authoritative, so "has this image failed" remains a derived read of a
 * real rendered `<img>` outcome, never a second piece of state.
 */

/** Lifecycle of one image URL as the carousel observes it. */
export type ImageStatus = "loading" | "loaded" | "error";

/**
 * Immutable view of one resource handed to React via `useSyncExternalStore`.
 * The store keeps the *same frozen object* until something actually changes,
 * so React's snapshot comparison is a referential no-op between renders.
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
  /**
   * Register that a rendered slide is now loading this URL. The registration
   * happens before idle preload work so the store never opens an offscreen
   * fetch for an image already owned by the DOM.
   */
  observe(url: string): void;
  /** Per-URL subscription for `useSyncExternalStore`. Returns an unsubscribe. */
  subscribe(url: string, listener: () => void): () => void;
  /**
   * Warm a set of URLs: for any URL not already tracked, start an offscreen
   * low-priority fetch + queued decode. URLs already tracked (by an earlier
   * warm-up or by a rendered slide) are skipped, so the store never opens a
   * redundant connection for an image a slide is already loading.
   */
  preload(urls: readonly string[]): void;
  /**
   * Gate queued decode work. Fetch initiation is owned by the caller; decode
   * draining is owned here so a queue started in idle cannot keep consuming
   * main-thread work after motion resumes.
   */
  setDecodeEnabled(enabled: boolean): void;
  /** Record the outcome of a real, on-screen `<img>`. */
  reportLoaded(url: string): void;
  reportError(url: string): void;
  /**
   * Ask the store to retry an errored URL. Deduplicated, capped, and
   * exponentially backed off internally — the caller just expresses intent.
   */
  requestRetry(url: string): void;
  /** Drop every tracked URL outside `allowed`, releasing its offscreen image. */
  prune(allowed: readonly string[]): void;
  /** Release every timer, idle callback, and DOM element. Call on unmount. */
  dispose(): void;
}
