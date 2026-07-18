import { forwardRef, memo } from "react";

interface PaginationWidgetDotProps {
  className?: string;
}

export const PaginationWidgetDot = memo(
  forwardRef<HTMLDivElement, PaginationWidgetDotProps>(
    function PaginationWidgetDot({ className }, ref) {
      // Initial inline values keep the dot invisible until the binding
      // writes the first frame. This avoids a flash of the un-projected
      // dots when the widget first mounts.
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
