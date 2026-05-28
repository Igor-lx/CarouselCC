import { forwardRef, memo } from "react";

interface PaginationWidgetDotProps {
  className?: string;
}

export const PaginationWidgetDot = memo(
  forwardRef<HTMLDivElement, PaginationWidgetDotProps>(
    function PaginationWidgetDot({ className }, ref) {
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
