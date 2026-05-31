export interface ControlsClassMap {
  [key: string]: string | undefined;
  navZone?: string;
  navZoneL?: string;
  navZoneR?: string;
  navButton?: string;
}

export interface ControlsProps {
  className?: ControlsClassMap;
}
