import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors",
  {
    variants: {
      variant: {
        brand: "border-brand/30 bg-brand/10 text-brand-soft",
        outline: "border-white/15 bg-white/[0.04] text-ink-muted",
        amber: "border-amber-400/30 bg-amber-400/10 text-amber-300",
        blue: "border-sky-400/30 bg-sky-400/10 text-sky-300",
        red: "border-red-400/30 bg-red-400/10 text-red-300",
        slate: "border-white/10 bg-white/[0.06] text-white/70",
      },
    },
    defaultVariants: { variant: "brand" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
