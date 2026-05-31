/**
 * `data-gen` — the carousel's self-contained content-generation kit.
 *
 * Node-only; imports nothing from the carousel component, so the folder can be
 * copied to a server and run on its own. Turns responsive image assets into the
 * `GeneratedSlide[]` JSON document the component fetches at runtime. The browser
 * component must never import from here (keeps `node:fs` out of the bundle).
 *
 * Run via the CLI (`cli.ts <config.json>`), or call `runDataGen(config)` /
 * `generateSlides(...)` / `buildSlide(...)` programmatically.
 */
export { runDataGen } from "./runDataGen";
export type {
  DataGenConfig,
  DataGenSource,
  DataGenVariant,
  DataGenResult,
} from "./runDataGen";
export { generateSlides, slugFromUrl } from "./generateSlides";
export type {
  GenerateSlidesInput,
  GenVariantWidth,
  GenSourceGroup,
} from "./generateSlides";
export { buildSlide } from "./buildSlide";
export type {
  BuildSlideInput,
  ImageCandidate,
  ArtDirectedSource,
} from "./buildSlide";
export type {
  GeneratedSlide,
  GeneratedImage,
  GeneratedImageSource,
} from "./types";
