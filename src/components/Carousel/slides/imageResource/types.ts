export type ImageStatus = "loading" | "loaded" | "error";

export interface ImageResourceSnapshot {
  readonly status: ImageStatus;
  readonly generation: number;
}

export interface ImageResourceStore {
  getSnapshot(url: string): ImageResourceSnapshot;
  subscribe(url: string, listener: () => void): () => void;
  reportLoaded(url: string): void;
  reportError(url: string): void;
  requestRetry(url: string): void;
  prune(allowed: readonly string[]): void;
  dispose(): void;
}
