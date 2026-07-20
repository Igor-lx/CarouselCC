import { useMedia, type MediaState } from "../../../../shared";
import { SLIDE_VIEWPORT_AXES } from "../config/viewport";

/**
 * The carousel's viewport sensor — ONE facade call over the axes declared in
 * `config/viewport.ts`. Every consumer reads from this single result:
 *  - the root stamps `.breakpoint` / `.orientation` / `.flags` as data
 *    attributes (the styling contract of the component SCSS);
 *  - the responsive module picks crops via `.matches` and re-runs on
 *    `.signature`;
 *  - the reorientation veil masks a swap on `.signature`.
 * Backed by the shared `useMediaQuery` store, so calling it in several
 * consumers costs one browser listener per distinct condition, not per call.
 */
export const useSlideViewport = (): MediaState => useMedia(SLIDE_VIEWPORT_AXES);
