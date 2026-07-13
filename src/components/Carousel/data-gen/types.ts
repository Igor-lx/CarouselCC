/**
 * The slide shape this generator EMITS into the content document.
 *
 * It is intentionally a local, self-contained type — `data-gen/` never imports
 * from the carousel component, so the whole folder can be copied to a server
 * and run on its own. It is a narrow, JSON-serialisable subset of the
 * component's `Slide` (string `id`, string `content`), which is exactly what a
 * generated document contains; the component accepts it as a valid `Slide`.
 *
 * The contract between this producer and the component consumer is the JSON
 * shape below — keep it in step with the component's `Slide` / `Slide.image`.
 */

export interface GeneratedImageSource {
  media: string;
  srcSet: string;
  sizes?: string;
  type?: string;
  /** Intrinsic aspect (width / height) of this set's crop — lets the
   * component compare candidates across sets by pixel AREA in single-set
   * mode. Declared by the config (the person who cut the crops knows it). */
  aspect?: number;
}

export interface GeneratedImage {
  srcSet?: string;
  sizes?: string;
  /** Intrinsic aspect (width / height) of the default set's crop. */
  aspect?: number;
  sources?: GeneratedImageSource[];
}

export interface GeneratedSlide {
  id: string;
  /** Canonical identity + `<img>` fallback URL. */
  content: string;
  alt?: string;
  image?: GeneratedImage;
}
