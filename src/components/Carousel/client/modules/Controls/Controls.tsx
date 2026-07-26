// See docs/architecture/modules.md
import { memo, useMemo } from "react";

import { mergeStyleMaps } from "../../../../../shared";
import { useCarouselStable } from "../../context";
import type { CarouselSlotComponent } from "../../slots";
import styles from "./Controls.module.scss";
import { NavigationZone } from "./NavigationZone";
import type { ControlsProps } from "./types";

const ControlsBase = memo(function Controls({ className }: ControlsProps) {
  const {
    layout: { isAtStart, isAtEnd },
    navigation: { handlePrev, handleNext },
  } = useCarouselStable();

  const classNames = useMemo(
    () => (className ? mergeStyleMaps(styles, className) : styles),
    [className],
  );

  return (
    <>
      {!isAtStart && (
        <NavigationZone direction="left" classNames={classNames} onClick={handlePrev} />
      )}
      {!isAtEnd && (
        <NavigationZone direction="right" classNames={classNames} onClick={handleNext} />
      )}
    </>
  );
});

export const Controls: CarouselSlotComponent<typeof ControlsBase, "controls"> =
  Object.assign(ControlsBase, { slot: "controls" as const });
