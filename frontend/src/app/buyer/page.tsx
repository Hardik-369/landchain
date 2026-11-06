"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, Filter, Search, SlidersHorizontal, TrendingUp, Wallet } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { PropertyCard } from "@/components/property-card";
import { StatCard } from "@/components/stat-card";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApi } from "@/lib/hooks/use-api";
import { getProperties, type PropertyFilters } from "@/lib/api/properties";
import { CATEGORY_LABELS, CITIES } from "@/lib/constants";
import { cn, formatCompactCurrency } from "@/lib/utils";
import type { PropertyCategory } from "@/lib/types";

const SORT_OPTIONS: { value: NonNullable<PropertyFilters["sort"]>; label: string }[] = [
  { value: "funding", label: "Funding progress" },
  { value: "yield", label: "Highest yield" },
  { value: "value_asc", label: "Asset value: low to high" },
  { value: "value_desc", label: "Asset value: high to low" },
  { value: "newest", label: "Recently listed" },
];

export default function BuyerMarketplacePage() {
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [city, setCity] = React.useState("all");
  const [category, setCategory] = React.useState<PropertyCategory | "all">("all");
  const [status, setStatus] = React.useState<PropertyFilters["status"]>("all");
  const [sort, setSort] = React.useState<NonNullable<PropertyFilters["sort"]>>("funding");

  React.useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 320);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: properties, loading, error } = useApi(
    () => getProperties({ search, city, category, status, sort }),
    [search, city, category, status, sort],
  );

  const list = properties ?? [];
  const avgYield = list.length
    ? list.reduce((sum, property) => sum + property.expectedYield, 0) / list.length
    : 0;
  const totalValue = list.reduce((sum, property) => sum + property.totalValue, 0);
  const lowestEntry = list.length
    ? Math.min(...list.map((property) => property.minInvestment))
    : 0;
  const activeFilters = [
    city !== "all",
    category !== "all",
    status !== "all",
    search.length > 0,
  ].filter(Boolean).length;

  return (
    <DashboardShell>
      <PageHeader
        eyebrow="Buyer marketplace"
        title="Fractional property marketplace"
        description="Browse RERA-verified residential, commercial and land assets. Every listing has cleared title diligence and a registry anchor before units are offered."
        actions={
          <>
            <Link href="/registry">
              <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-ink-line px-3.5 text-[13px] font-medium text-white/80 transition-colors hover:border-brand/40 hover:text-white">
                <Building2 className="size-4" />
                Registry
              </span>
            </Link>
            <Link href="/resale">
              <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-ink-line px-3.5 text-[13px] font-medium text-white/80 transition-colors hover:border-brand/40 hover:text-white">
                <TrendingUp className="size-4" />
                Resale units
              </span>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Listings available"
          value={String(list.length)}
          hint={activeFilters ? `${activeFilters} filter${activeFilters > 1 ? "s" : ""} active` : "All verified assets"}
          icon={Building2}
        />
        <StatCard
          label="Average target yield"
          value={`${avgYield.toFixed(1)}%`}
          hint="Weighted across listings"
          icon={TrendingUp}
          accent="sky"
        />
        <StatCard
          label="Asset value in view"
          value={formatCompactCurrency(totalValue)}
          hint="Cumulative property value"
          icon={SlidersHorizontal}
          accent="violet"
        />
        <StatCard
          label="Lowest entry"
          value={lowestEntry ? formatCompactCurrency(lowestEntry) : "—"}
          hint="Minimum investment"
          icon={Wallet}
          accent="amber"
        />
      </div>

      <Card className="mt-6 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/30" />
            <Input
              placeholder="Search by project, city or property ID…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="pl-10"
              aria-label="Search properties"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:w-auto">
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger className="lg:w-40" aria-label="Filter by city">
                <SelectValue placeholder="City" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cities</SelectItem>
                {CITIES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={category}
              onValueChange={(value) => setCategory(value as PropertyCategory | "all")}
            >
              <SelectTrigger className="lg:w-44" aria-label="Filter by category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={sort}
              onValueChange={(value) => setSort(value as NonNullable<PropertyFilters["sort"]>)}
            >
              <SelectTrigger className="col-span-2 sm:col-span-1 lg:w-52" aria-label="Sort properties">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-line/70 pt-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-white/30">
            <Filter className="size-3" /> Quick filters
          </span>
          {([
            { label: "All", value: "all" as const },
            { label: "Open now", value: "open" as const },
            { label: "Fully funded", value: "funded" as const },
            { label: "Pending verification", value: "pending_verification" as const },
          ]).map((pill) => (
            <button
              key={pill.value}
              type="button"
              onClick={() => setStatus(pill.value)}
              aria-pressed={status === pill.value}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                status === pill.value
                  ? "border-brand/40 bg-brand/10 text-brand-soft"
                  : "border-ink-line text-ink-muted hover:border-white/20 hover:text-white",
              )}
            >
              {pill.label}
            </button>
          ))}
          <span className="ml-auto text-[12px] text-ink-muted">
            {list.length} {list.length === 1 ? "property" : "properties"} in view
          </span>
        </div>
      </Card>

      <div className="mt-6">
        {error ? (
          <Card className="p-6 text-sm text-red-300">{error}</Card>
        ) : loading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-[404px] animate-pulse rounded-2xl border border-ink-line bg-ink-card/60"
              />
            ))}
          </div>
        ) : list.length === 0 ? (
          <Card className="grid place-items-center p-14 text-center">
            <span className="grid size-12 place-items-center rounded-xl bg-white/[0.04] text-white/40">
              <Search className="size-5" />
            </span>
            <h3 className="mt-4 text-sm font-semibold text-white">No properties match those filters</h3>
            <p className="mt-1 max-w-sm text-[13px] text-ink-muted">
              Try a different city or category, or clear the search to see all 15
              registered assets.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setCity("all");
                setCategory("all");
                setStatus("all");
              }}
              className="mt-4 text-[12px] font-medium text-brand-soft hover:underline"
            >
              Clear filters
            </button>
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
