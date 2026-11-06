"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-45 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-ink shadow-[0_14px_34px_-16px_rgba(16,185,129,0.9)] hover:bg-brand-soft hover:shadow-[0_18px_40px_-16px_rgba(16,185,129,0.95)]",
        secondary:
          "border border-white/12 bg-white/[0.07] text-white hover:border-white/20 hover:bg-white/[0.12]",
        outline:
          "border border-ink-line bg-transparent text-white hover:border-brand/45 hover:bg-brand/[0.07] hover:text-brand-soft",
        ghost: "text-ink-muted hover:bg-white/[0.07] hover:text-white",
        light: "bg-ink text-white hover:bg-ink-soft",
        white: "bg-white text-ink hover:bg-mist",
        danger:
          "bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 hover:text-red-200",
        link: "text-brand-soft underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3.5 text-[13px]",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-[15px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  loading,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
}

export { buttonVariants };
