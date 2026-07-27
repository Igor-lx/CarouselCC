// See ./README.md
import { Children, isValidElement, type ReactNode } from "react";

interface SlottedComponent {
  slot?: string;
}

export function resolveSlots<T extends string>(
  children: ReactNode,
  slots: readonly T[],
): Record<T, ReactNode> {
  const result = Object.create(null) as Record<T, ReactNode>;
  for (const slot of slots) result[slot] = null;

  const known = new Set<T>(slots);

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const slotName = (child.type as SlottedComponent).slot;
    if (!slotName) return;

    if (!known.has(slotName as T)) {
      if (import.meta.env.DEV) {
        console.warn(
          `[resolveSlots]: unknown slot "${slotName}". expected one of [${slots.join(", ")}]`,
        );
      }
      return;
    }

    if (import.meta.env.DEV && result[slotName as T]) {
      console.warn(
        `[resolveSlots]: multiple children for slot "${slotName}". last one wins.`,
      );
    }

    result[slotName as T] = child;
  });

  return result;
}
