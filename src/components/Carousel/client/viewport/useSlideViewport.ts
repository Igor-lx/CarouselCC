import { useMedia, type MediaState } from "../../../../shared";
import { SLIDE_VIEWPORT_AXES } from "../config/viewport";

/**
 * The carousel's viewport sensor — ONE facade call over the axes declared in
 * `config/viewport.ts`. Its two consumers each read one part of the result:
 *  - the root stamps `.breakpoint` / `.orientation` / `.flags` as data
 *    attributes (the styling contract of the component SCSS);
 *  - the reorientation veil masks a crop swap on `.signature`.
 * (`.matches` is part of the shared MediaState surface but the carousel does
 * not use it — the art-direction crop is selected by the browser's own
 * `<picture>` matching, not re-derived here.)
 * Backed by the shared `useMediaQuery` store, so calling it in several
 * consumers costs one browser listener per distinct condition, not per call.
 */
export const useSlideViewport = (): MediaState => useMedia(SLIDE_VIEWPORT_AXES);
