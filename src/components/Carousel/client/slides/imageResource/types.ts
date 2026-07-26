// Image-resource SSOT — public contract. See docs/architecture/slides.md

/** Lifecycle of one image URL as the carousel renders it. */
export type ImageStatus = "loading" | "loaded" | "error";

export interface ImageResourceSnapshot {
  readonly status: ImageStatus;
  /** Bumped per retry; consumers use it as the `<img>` `key` to force a remount. */
  readonly generation: number;
}

/** The framework-agnostic image-resource store; `useImageResource` bridges to React. */
export interface ImageResourceStore {
  /** Stable snapshot for a URL; unknown URLs read as `loading` (optimistic default). */
  getSnapshot(url: string): ImageResourceSnapshot;
  subscribe(url: string, listener: () => void): () => void;
  /** Record the outcome of a real, on-screen `<img>`. */
  reportLoaded(url: string): void;
  reportError(url: string): void;
  /** Retry an errored URL (deduped, capped, backed off internally). */
  requestRetry(url: string): void;
  /** Drop every tracked URL outside `allowed`, releasing its retry timer. */
  prune(allowed: readonly string[]): void;
  /** Soft, idempotent reset — the store stays usable (StrictMode-safe). */
  dispose(): void;
}
