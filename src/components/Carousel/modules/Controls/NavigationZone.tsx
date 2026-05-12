import clsx from "clsx";
import { memo } from "react";

import { ChevronIcon } from "../../../../shared";
import type { ControlsClassMap } from "./types";

interface NavigationZoneProps {
  direction: "left" | "right";
  classNames: ControlsClassMap;
  onClick: () => void;
}

export const NavigationZone = memo(function NavigationZone({
  direction,
  classNames,
  onClick,
}: NavigationZoneProps) {
  const directionClass =
    direction === "left" ? classNames.navZoneL : classNames.navZoneR;

  return (
    <button
      type="button"
      className={clsx(classNames.navZone, directionClass)}
      onClick={onClick}
      aria-label={direction === "left" ? "Previous slide" : "Next slide"}
    >
      <div aria-hidden="true" className={classNames.navButton}>
        <ChevronIcon direction={direction} />
      </div>
    </button>
  );
});
