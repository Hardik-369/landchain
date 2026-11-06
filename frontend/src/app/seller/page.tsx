"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  PlusCircle,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { PropertyVisual } from "@/components/property-visual";
import { SimpleBarChart } from "@/components/charts/bar-chart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useApi } from "@/lib/hooks/use-api";
import { getSellerProperties, getSellerStats } from "@/lib/api/seller";
import {
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatNumber,
} from "@/lib/utils";

export default function SellerDashboardPage() {
  const { data: properties, loading } = useApi(() => getSellerProperties(), []);
  const { data: stats } = useApi(() => getSellerStats(), []);

  return (
    <DashboardShell requireAuth roles={["seller"]}>
      <PageHeader
        eyebrow="Seller workspace"
        title="Your property portfolio"
        description="Track capital raised, investor participation and verification status across every asset you have listed on LANDCHAIN."
        actions={
          <Link href="/seller/new">
            <Button>
              <PlusCircle />
              List a property
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Portfolio value"
          value={stats ? formatCompactCurrency(stats.portfolioValue) : "—"}
          hint="Across all listed assets"
          icon={Building2}
        />
        <StatCard
          label="Capital raised"
          value={stats ? formatCompactCurrency(stats.totalRaised) : "—"}
          hint="Subscribed by investors"
          icon={Wallet}
          accent="sky"
          delta={stats ? { value: "12.4% this month", direction: "up" } : undefined}
        />
        <StatCard
          label="Active listings"
          value={stats ? String(stats.activeListings) : "—"}
          hint="Open or fully funded"
          icon={TrendingUp}
          accent="violet"
        />
        <StatCard
          label="Investors"
          value={stats ? formatNumber(stats.totalInvestors) : "—"}
          hint="Unique unit holders"
          icon={Users}
          accent="amber"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Monthly capital raised</h2>
              <p className="mt-1 text-[12px] text-ink-muted">
                Subscriptions across your listings, last six months.
              </p>
            </div>
            <span className="rounded-md border border-brand/25 bg-brand/[0.08] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-soft">
              Live
            </span>
          </div>
          <div className="mt-4">
            {stats ? (
              <SimpleBarChart
                data={stats.monthlyFunding}
                dataKey="funded"
                label="Capital raised"
                height={250}
              />
            ) : (
              <div className="h-[250px] animate-pulse rounded-xl bg-white/[0.03]" />
            )}
          </div>
        </Card>

        <Card className="flex flex-col p-5">
          <h2 className="text-sm font-semibold text-white">Listing readiness</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
            Assets move through registry verification before units go live.
          </p>

          <ol className="mt-5 flex-1 space-y-4">
            {[
              { label: "Documents submitted", detail: "Sale deed, EC, RERA", done: true },
              { label: "Title due diligence", detail: "Legal ops review", done: true },
              { label: "Hedera registry anchor", detail: "Consensus timestamp", done: true },
              { label: "Investment window", detail: "Units offered to investors", done: true },
            ].map((step) => (
              <li key={step.label} className="flex gap-3">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand/15">
                  <span className="size-1.5 rounded-full bg-brand" />
                </span>
                <div>
                  <p className="text-[12px] font-medium text-white">{step.label}</p>
                  <p className="text-[11px] text-ink-muted">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-5 rounded-xl border border-ink-line bg-ink-soft/50 p-3">
            <p className="text-[11px] leading-relaxed text-ink-muted">
              New listings are reviewed within 48 hours. Ensure the seller name on the
              deed matches your verified account.
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Your listings</h2>
          <span className="text-[11px] text-white/35">
            {properties?.length ?? 0} assets
          </span>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-36 animate-pulse rounded-2xl border border-ink-line bg-ink-card/60"
              />
            ))}
          </div>
        ) : properties && properties.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {properties.map((property) => {
              const funded = Math.min(
                100,
                Math.round((property.unitsSold / property.totalUnits) * 100),
              );
              const raised = property.unitsSold * property.minInvestment;
              return (
                <Card
                  key={property.id}
                  className="group overflow-hidden transition-colors hover:border-brand/30"
                >
                  <div className="flex gap-4 p-4">
                    <PropertyVisual
                      seed={property.imageSeed}
                      className="h-24 w-28 shrink-0 rounded-xl"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-[14px] font-semibold text-white">
                            {property.title}
                          </h3>
                          <p className="mt-0.5 text-[11px] text-ink-muted">
                            {property.city} · {property.id}
                          </p>
                        </div>
                        <StatusPill status={property.status} />
                      </div>

                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[10px] text-ink-muted">
                          <span>
                            {formatNumber(property.unitsSold)} /{" "}
                            {formatNumber(property.totalUnits)} units
                          </span>
                          <span className="font-semibold text-white">{funded}%</span>
                        </div>
                        <Progress value={funded} className="mt-1.5 h-1.5" />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px]">
                        <span className="text-ink-muted">
                          Raised{" "}
                          <span className="font-medium text-white">
                            {formatCompactCurrency(raised)}
                          </span>
                        </span>
                        <span className="text-ink-muted">
                          Investors{" "}
                          <span className="font-medium text-white">{property.investors}</span>
                        </span>
                        <span className="text-ink-muted">
                          Listed{" "}
                          <span className="font-medium text-white">
                            {formatDate(property.listedAt)}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-ink-line px-4 py-2.5">
                    <span className="text-[11px] text-ink-muted">
                      Asset value {formatCurrency(property.totalValue)}
                    </span>
                    <Link
                      href={`/registry/${property.id}`}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-soft hover:underline"
                    >
                      Registry record
                      <ArrowUpRight className="size-3" />
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="grid place-items-center p-12 text-center">
            <span className="grid size-12 place-items-center rounded-xl bg-white/[0.04] text-white/40">
              <Building2 className="size-5" />
            </span>
            <h3 className="mt-4 text-sm font-semibold text-white">No properties listed yet</h3>
            <p className="mt-1 max-w-sm text-[13px] text-ink-muted">
              Submit your first asset for registry verification and start raising
              fractional capital.
            </p>
            <Link href="/seller/new" className="mt-5">
              <Button size="sm">
                <PlusCircle />
                List a property
              </Button>
            </Link>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
