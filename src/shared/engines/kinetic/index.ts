// The kinetic facade: one draggable/flyable value in ONE hook (useKineticValue),
// self-sufficient by duplication (internal/ forks gesture + motion). Public
// surface only. See README.md.
export { useKineticValue } from "./useKineticValue";
export { KINETIC_DEFAULTS } from "./internal/defaults";
export type {
  KineticConfig,
  KineticRelease,
  KineticValue,
  UseKineticValueInput,
} from "./internal/types";
