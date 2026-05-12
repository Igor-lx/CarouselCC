type StyleMap = Record<string, string>;

/**
 * Combine multiple CSS module maps by concatenating class strings per key.
 * Used to overlay user-supplied class overrides on top of the component's
 * own module map without losing the originals.
 */
export function mergeStyleMaps<T extends StyleMap>(
  ...maps: (Partial<T> | null | undefined)[]
): T {
  const result: StyleMap = {};

  for (const map of maps) {
    if (!map) continue;
    for (const key in map) {
      const value = map[key];
      if (!value) continue;
      result[key] = result[key] ? `${result[key]} ${value}` : value;
    }
  }

  return result as T;
}
