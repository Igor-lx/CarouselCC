// See docs/architecture/modules.md
import { memo, type Ref } from "react";

interface PaginationWidgetDotProps {
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

export const PaginationWidgetDot = memo(function PaginationWidgetDot({
  className,
  ref,
}: PaginationWidgetDotProps) {
  // Invisible until the binding writes the first frame (avoids a mount flash).
  return (
    <div
      ref={ref}
      className={className}
      style={{ transform: "translate3d(0,0,0) scale(0)", opacity: 0 }}
    />
  );
});
