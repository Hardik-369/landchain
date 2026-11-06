import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PropertyStatus } from "@/lib/types";

const STATUS_STYLES: Record<
  PropertyStatus,
  { label: string; variant: "brand" | "amber" | "blue" | "slate" | "red" }
> = {
  open: { label: "Open", variant: "brand" },
  active: { label: "Active", variant: "brand" },
  funded: { label: "Funded", variant: "blue" },
  pending_verification: { label: "Pending verification", variant: "amber" },
  rejected: { label: "Rejected", variant: "red" },
};

export function StatusPill({
  status,
  className,
}: {
  status: PropertyStatus;
  className?: string;
}) {
  const config = STATUS_STYLES[status] ?? STATUS_STYLES.open;
  return (
    <Badge variant={config.variant} className={cn("normal-case tracking-wide", className)}>
      <span
        className={cn(
          "size-1.5 rounded-full",
          config.variant === "brand" && "bg-brand",
          config.variant === "amber" && "bg-amber-400",
          config.variant === "blue" && "bg-sky-400",
          config.variant === "red" && "bg-red-400",
          config.variant === "slate" && "bg-white/50",
        )}
      />
      {config.label}
    </Badge>
  );
}
