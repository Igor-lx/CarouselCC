// See docs/architecture/viewport.md
import { useMedia, type MediaState } from "../../../../shared";
import { SLIDE_VIEWPORT_AXES } from "../config/viewport";

/** The carousel's viewport sensor — one media-facade call over the config axes. */
export const useSlideViewport = (): MediaState => useMedia(SLIDE_VIEWPORT_AXES);
