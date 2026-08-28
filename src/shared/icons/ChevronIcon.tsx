// See ./README.md
export type ChevronDirection = "right" | "left" | "up" | "down";

interface ChevronIconProps {
  direction: ChevronDirection;
  className?: string;
}

const ROTATION: Record<ChevronDirection, string | undefined> = {
  right: "rotate(0deg)",
  left: "rotate(180deg)",
  up: "rotate(-90deg)",
  down: "rotate(90deg)",
};

export function ChevronIcon({
  direction = "right",
  className,
}: ChevronIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
      focusable="false"
      style={{ transform: ROTATION[direction] }}
    >
      <path
        fill="currentColor"
        d="M8.6898 20a.6846.6846 0 0 1-.489-.203c-.2677-.2677-.2677-.7106 0-.9783l6.0169-6.017c.443-.4429.443-1.1628 0-1.6057l-6.017-6.017c-.2676-.2677-.2676-.7107 0-.9783.2676-.2676.7106-.2676.9783 0l6.017 6.017a2.5141 2.5141 0 0 1 .7382 1.7811c0 .6737-.2584 1.3105-.7382 1.7812l-6.017 6.017c-.1385.1292-.3138.203-.4892.203Z"
      />
    </svg>
  );
}
