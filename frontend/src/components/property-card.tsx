import Link from "next/link";
import { ArrowUpRight, MapPin, ShieldCheck, TrendingUp } from "lucide-react";
import { PropertyVisual } from "@/components/property-visual";
import { StatusPill } from "@/components/status-pill";
import { Progress } from "@/components/ui/progress";
import { CATEGORY_LABELS } from "@/lib/constants";
import {
  cn,
  formatCompactCurrency,
  formatCurrency,
  formatNumber,
} from "@/lib/utils";
import type { Property } from "@/lib/types";

export function PropertyCard({
  property,
  className,
}: {
  property: Property;
  className?: string;
}) {
  const funded = Math.min(
    100,
    Math.round((property.unitsSold / property.totalUnits) * 100),
  );

  return (
    <Link
      href={`/buyer/${property.id}`}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-ink-line bg-ink-card transition-all duration-300 hover:-translate-y-1 hover:border-brand/35 hover:shadow-[0_30px_60px_-32px_rgba(16,185,129,0.45)]",
        className,
      )}
    >
      <div className="relative h-44 w-full overflow-hidden">
        <PropertyVisual
          seed={property.imageSeed}
          category={property.category}
          className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <StatusPill status={property.status} className="backdrop-blur-md" />
        </div>
        <span className="absolute right-3 top-3 rounded-md border border-white/10 bg-ink/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/70 backdrop-blur-md">
          {CATEGORY_LABELS[property.category]}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold leading-snug text-white transition-colors group-hover:text-brand-soft">
              {property.title}
            </h3>
            <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
              <MapPin className="size-3" />
              {property.city}, {property.state}
            </p>
          </div>
          <ArrowUpRight className="size-4 shrink-0 text-white/25 transition-colors group-hover:text-brand" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-[0.1em] text-white/35">
              Min. investment
            </p>
            <p className="mt-1 font-semibold text-white">
              {formatCurrency(property.minInvestment)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.1em] text-white/35">
              Target yield
            </p>
            <p className="mt-1 flex items-center gap-1 font-semibold text-brand-soft">
              <TrendingUp className="size-3.5" />
              {property.expectedYield.toFixed(1)}% p.a.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-ink-muted">
              {formatNumber(property.unitsSold)} / {formatNumber(property.totalUnits)} units
            </span>
            <span className="font-semibold text-white">{funded}% funded</span>
          </div>
          <Progress value={funded} className="h-1.5" />
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-ink-line/70 pt-3 text-[11px] text-ink-muted">
          <span>Asset value {formatCompactCurrency(property.totalValue)}</span>
          <span className="inline-flex items-center gap-1 text-brand-soft/90">
            <ShieldCheck className="size-3.5" />
            {property.status === "pending_verification" ? "Verification pending" : "Verified title"}
          </span>
        </div>
      </div>
    </Link>
  );
}
