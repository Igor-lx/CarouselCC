/**
 * CLIENT STATE — blanks for reading what the client reports about itself
 * right now: `media/` (viewport tiers, orientation, media conditions) and
 * `environment/` (reduced-motion, touch, data-saver). Both sit on the ONE
 * store in `shared/useMediaQuery`.
 *
 * This is a STORAGE OF BLANKS, not a dependency graph: copy out any
 * combination — a single hook, a whole library, one facade, several at once.
 * Each blank keeps its own copies of the hooks it uses (so nothing is
 * missing when you lift it), and the only file they all share is
 * `shared/useMediaQuery` — visible at a glance, so you know to take it along
 * AND to keep exactly one of it.
 */
export * from "./shared";
export * from "./media";
export * from "./environment";
