/**
 * The KINETIC blank — the most turnkey member of the library collection: one
 * draggable, flyable, compositor-animated value in ONE hook. Pick a folder
 * by task:
 *
 *   value follows a finger + rides curves, simple policy  → THIS folder
 *   motion only (autoplay, meters, progress — no finger)  → shared/motion
 *   full control (a carousel-grade state machine)         → shared/gesture
 *                                                           + shared/motion
 *
 * This folder is self-sufficient BY DUPLICATION: it carries its own forks of
 * the gesture and motion engines (see ./gesture, ./motion) and imports
 * nothing outside itself — copy ONE folder and go. The forks may drift from
 * the standalone originals as the blank evolves; each blank in the
 * collection is its own universal заготовка, not a dependency graph.
 *
 * The facade is deliberately narrow — the fused API only. The internal forks
 * are reachable by path for surgery, but if you need their APIs routinely,
 * you are in "full control" territory: take the standalone engines instead.
 */
export { useKineticValue } from "./useKineticValue";
export { KINETIC_DEFAULTS } from "./defaults";
export type {
  KineticConfig,
  KineticRelease,
  KineticValue,
  UseKineticValueInput,
} from "./types";
