// See docs/architecture/slots.md
export const CAROUSEL_SLOTS = [
  "pagination",
  "controls",
  "diagnostic",
  "responsive-images",
] as const;

export type CarouselSlotName = (typeof CAROUSEL_SLOTS)[number];

export type CarouselSlotComponent<
  Component,
  SlotName extends CarouselSlotName,
> = Component & {
  slot: SlotName;
};
