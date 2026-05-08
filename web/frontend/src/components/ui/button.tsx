import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:shadow-none theme-dark:focus-visible:ring-offset-slate-950",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-sky-500 via-indigo-500 to-violet-600 text-white shadow-[0_7px_16px_rgba(79,70,229,0.22)] hover:from-sky-400 hover:via-indigo-500 hover:to-violet-600 hover:shadow-[0_10px_20px_rgba(99,102,241,0.28)]",
        secondary:
          "border border-slate-300 bg-white/90 text-slate-900 shadow-[0_2px_8px_rgba(15,23,42,0.06)] hover:bg-white hover:border-slate-400 hover:shadow-[0_6px_14px_rgba(15,23,42,0.1)] theme-dark:border-slate-600 theme-dark:bg-slate-800 theme-dark:text-slate-100 theme-dark:hover:border-slate-500 theme-dark:hover:bg-slate-700",
        outline:
          "border border-slate-300 bg-transparent text-slate-700 hover:bg-slate-100 hover:border-slate-400 theme-dark:border-slate-600 theme-dark:text-slate-200 theme-dark:hover:border-slate-500 theme-dark:hover:bg-slate-800",
        ghost: "hover:bg-slate-100 theme-dark:hover:bg-slate-800",
        accent:
          "bg-gradient-to-br from-amber-300 via-amber-200 to-orange-300 text-slate-900 shadow-[0_8px_16px_rgba(245,158,11,0.24)] hover:from-amber-200 hover:via-yellow-200 hover:to-orange-300 hover:shadow-[0_10px_20px_rgba(245,158,11,0.3)]"
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
