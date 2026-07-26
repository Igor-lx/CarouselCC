import { forwardRef, memo } from "react";

interface PaginationWidgetDotProps {
  className?: string;
}

export const PaginationWidgetDot = memo(
  forwardRef<HTMLDivElement, PaginationWidgetDotProps>(
    function PaginationWidgetDot({ className }, ref) {
      // Invisible until the binding writes the first frame (avoids a mount flash).
      return (
        <div
          ref={ref}
          className={className}
          style={{ transform: "translate3d(0,0,0) scale(0)", opacity: 0 }}
        />
      );
    },
  ),
);
