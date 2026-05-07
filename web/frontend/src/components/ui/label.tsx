import { forwardRef, type LabelHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        "text-sm font-medium leading-none text-slate-700 peer-disabled:cursor-not-allowed peer-disabled:opacity-70 theme-dark:text-slate-200",
        className
      )}
      {...props}
    />
  )
);
Label.displayName = "Label";
