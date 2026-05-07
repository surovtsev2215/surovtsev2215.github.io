import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none theme-dark:focus-visible:ring-offset-slate-950",
  {
    variants: {
      variant: {
        default: "bg-primary text-white hover:bg-primary/90",
        secondary:
          "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 theme-dark:border-slate-600 theme-dark:bg-slate-800 theme-dark:text-slate-100 theme-dark:hover:bg-slate-700",
        outline:
          "border border-slate-300 bg-transparent hover:bg-slate-100 theme-dark:border-slate-600 theme-dark:hover:bg-slate-800",
        ghost: "hover:bg-slate-100 theme-dark:hover:bg-slate-800",
        accent: "bg-accent text-slate-900 hover:bg-accent/90"
      },
      size: {
        default: "h-12 px-4 py-2",
        sm: "h-10 rounded-lg px-3",
        lg: "h-14 rounded-xl px-6 text-base",
        icon: "h-10 w-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
