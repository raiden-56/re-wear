import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[background,color,box-shadow,transform] duration-150 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-forest text-white hover:bg-forest-700 shadow-[0_1px_0_rgba(0,0,0,0.08)]",
        secondary: "bg-white text-charcoal ring-1 ring-line hover:ring-charcoal/30 hover:bg-cream",
        amber: "bg-amber text-charcoal hover:bg-[#e2ab55]",
        ghost: "text-charcoal hover:bg-cream-200",
        danger: "bg-danger text-white hover:bg-[#9c3826]",
        link: "text-forest underline-offset-4 hover:underline rounded-none px-0",
        outlineLight: "ring-1 ring-white/40 text-white hover:bg-white/10",
      },
      size: {
        sm: "h-8 px-3.5 text-sm",
        md: "h-10 px-5 text-sm",
        lg: "h-12 px-7 text-base",
        icon: "h-10 w-10",
        iconSm: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";
