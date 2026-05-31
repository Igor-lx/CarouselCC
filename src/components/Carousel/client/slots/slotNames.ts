export const CAROUSEL_SLOTS = ["pagination", "controls", "diagnostic"] as const;

export type CarouselSlotName = (typeof CAROUSEL_SLOTS)[number];

export type CarouselSlotComponent<
  Component,
  SlotName extends CarouselSlotName,
> = Component & {
  slot: SlotName;
};
