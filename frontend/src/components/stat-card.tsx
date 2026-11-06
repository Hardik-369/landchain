import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  delta,
  icon: Icon,
  accent = "brand",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: { value: string; direction: "up" | "down" };
  icon?: LucideIcon;
  accent?: "brand" | "sky" | "violet" | "amber";
  className?: string;
}) {
  const accentStyles = {
    brand: "bg-brand/10 text-brand-soft",
    sky: "bg-sky-400/10 text-sky-300",
    violet: "bg-violet-400/10 text-violet-300",
    amber: "bg-amber-400/10 text-amber-300",
  } as const;

  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted">
          {label}
        </p>
        {Icon ? (
          <span className={cn("grid size-8 place-items-center rounded-lg", accentStyles[accent])}>
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-[26px] font-semibold leading-none tracking-tight text-white">
        {value}
      </p>
      <div className="mt-3 flex items-center gap-2">
        {delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
              delta.direction === "up"
                ? "bg-brand/10 text-brand-soft"
                : "bg-red-400/10 text-red-300",
            )}
          >
            {delta.direction === "up" ? (
              <ArrowUpRight className="size-3" />
            ) : (
              <ArrowDownRight className="size-3" />
            )}
            {delta.value}
          </span>
        ) : null}
        {hint ? <span className="text-[11px] text-ink-muted">{hint}</span> : null}
      </div>
    </Card>
  );
}
