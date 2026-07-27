// See ./README.md
type StyleMap = Record<string, string>;

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
