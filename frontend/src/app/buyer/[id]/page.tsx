"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Calendar,
  CheckCircle2,
  Copy,
  FileText,
  Layers,
  MapPin,
  Ruler,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PropertyVisual } from "@/components/property-visual";
import { StatusPill } from "@/components/status-pill";
import { InvestmentCalculator } from "@/components/properties/investment-calculator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/auth-provider";
import { useApi } from "@/lib/hooks/use-api";
import { getRegistryRecord } from "@/lib/api/registry";
import { createInvestment } from "@/lib/api/portfolio";
import { CATEGORY_LABELS } from "@/lib/constants";
import {
  formatArea,
  formatCurrency,
  formatDateTime,
  formatNumber,
  truncateMiddle,
} from "@/lib/utils";
import type { Investment } from "@/lib/types";

function PropertyDetailContent() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { user } = useAuth();
  const { data: record, loading, error, setData } = useApi(
    () => getRegistryRecord(id),
    [id],
  );

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [units, setUnits] = React.useState(0);
  const [investing, setInvesting] = React.useState(false);
  const [investError, setInvestError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Investment | null>(null);
  const [copied, setCopied] = React.useState(false);

  const property = record?.property;

  function startInvestment(nextUnits: number) {
    if (!user) {
      router.push(`/auth?next=${encodeURIComponent(`/buyer/${id}`)}`);
      return;
    }
    setUnits(nextUnits);
    setInvestError(null);
    setResult(null);
    setConfirmOpen(true);
  }

  async function confirmInvestment() {
    if (!property) return;
    setInvesting(true);
    setInvestError(null);
    try {
      const investment = await createInvestment({ propertyId: property.id, units });
      setResult(investment);
      setData((current) =>
        current
          ? {
              ...current,
              property: {
                ...current.property,
                unitsSold: Math.min(
                  current.property.totalUnits,
                  current.property.unitsSold + units,
                ),
              },
            }
          : current,
      );
    } catch (err) {
      setInvestError(
        err instanceof Error ? err.message : "The investment could not be completed.",
      );
    } finally {
      setInvesting(false);
    }
  }

  function copyHash(value: string) {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  if (loading) {
    return (
      <DashboardShell>
        <div className="space-y-4">
          <div className="h-5 w-40 animate-pulse rounded bg-white/5" />
          <div className="h-10 w-2/3 animate-pulse rounded bg-white/5" />
          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <div className="h-[520px] animate-pulse rounded-2xl border border-ink-line bg-ink-card/60" />
            <div className="h-[460px] animate-pulse rounded-2xl border border-ink-line bg-ink-card/60" />
          </div>
        </div>
      </DashboardShell>
    );
  }

  if (error || !property) {
    return (
      <DashboardShell>
        <Card className="mx-auto mt-10 max-w-md p-8 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-white/[0.04] text-white/40">
            <Building2 className="size-5" />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-white">Property not found</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {error ?? "This property may have been removed from the marketplace."}
          </p>
          <Link href="/buyer" className="mt-5 inline-block">
            <Button variant="secondary" size="sm">
              Back to marketplace
            </Button>
          </Link>
        </Card>
      </DashboardShell>
    );
  }

  const funded = Math.min(
    100,
    Math.round((property.unitsSold / property.totalUnits) * 100),
  );
  const remainingUnits = property.totalUnits - property.unitsSold;

  return (
    <DashboardShell>
      <Link
        href="/buyer"
        className="mb-5 inline-flex items-center gap-1.5 text-[12px] text-ink-muted transition-colors hover:text-white"
      >
        <ArrowLeft className="size-3.5" />
        Marketplace
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={property.status} />
            <Badge variant="outline">{CATEGORY_LABELS[property.category]}</Badge>
            <span className="font-mono text-[11px] text-white/35">{property.id}</span>
          </div>
          <h1 className="mt-3 text-[26px] font-semibold leading-tight tracking-tight text-white sm:text-[32px]">
            {property.title}
          </h1>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-muted">
            <MapPin className="size-4" />
            {property.address}, {property.city}, {property.state}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/registry/${property.id}`}>
            <Button variant="secondary" size="sm">
              <ShieldCheck />
              View registry record
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.65fr_1fr] lg:items-start">
        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-ink-line">
            <PropertyVisual
              seed={property.imageSeed}
              category={property.category}
              className="h-64 w-full sm:h-80"
            />
            <div className="grid grid-cols-2 gap-px bg-ink-line/70 sm:grid-cols-4">
              {[
                {
                  label: "Asset value",
                  value: formatCurrency(property.totalValue),
                  icon: Building2,
                },
                {
                  label: "Price per unit",
                  value: formatCurrency(property.unitPrice),
                  icon: Layers,
                },
                {
                  label: "Built-up area",
                  value: formatArea(property.areaSqft),
                  icon: Ruler,
                },
                {
                  label: "Target yield",
                  value: `${property.expectedYield.toFixed(1)}% p.a.`,
                  icon: TrendingUp,
                },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="bg-ink-card px-4 py-4">
                    <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-white/35">
                      <Icon className="size-3" />
                      {stat.label}
                    </p>
                    <p className="mt-1.5 text-sm font-semibold text-white">{stat.value}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Funding progress</h2>
                <p className="mt-0.5 text-[12px] text-ink-muted">
                  {formatNumber(property.unitsSold)} of{" "}
                  {formatNumber(property.totalUnits)} units subscribed ·{" "}
                  {formatNumber(remainingUnits)} remaining
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold text-white">{funded}%</p>
                <p className="text-[10px] uppercase tracking-[0.1em] text-ink-muted">funded</p>
              </div>
            </div>
            <Progress value={funded} className="mt-4 h-2" />
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-ink-line bg-ink-soft/55 p-3">
                <p className="text-[10px] uppercase tracking-[0.1em] text-white/35">
                  Minimum investment
                </p>
                <p className="mt-1 text-sm font-semibold text-brand-soft">
                  {formatCurrency(property.minInvestment)}
                </p>
              </div>
              <div className="rounded-xl border border-ink-line bg-ink-soft/55 p-3">
                <p className="text-[10px] uppercase tracking-[0.1em] text-white/35">
                  Projected appreciation
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {property.expectedAppreciation.toFixed(1)}% · 5 yr
                </p>
              </div>
              <div className="rounded-xl border border-ink-line bg-ink-soft/55 p-3">
                <p className="text-[10px] uppercase tracking-[0.1em] text-white/35">
                  Listed on
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {new Date(property.createdAt).toLocaleDateString("en-IN", {
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="documents">
                  Documents ({property.documents.length})
                </TabsTrigger>
                <TabsTrigger value="registry">Registry & activity</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-5">
                <p className="text-[13px] leading-relaxed text-white/70">
                  {property.description}
                </p>
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">
                    Asset highlights
                  </h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {property.highlights.map((highlight) => (
                      <div
                        key={highlight}
                        className="flex items-center gap-2 rounded-lg border border-ink-line bg-ink-soft/40 px-3 py-2.5 text-[12px] text-white/80"
                      >
                        <CheckCircle2 className="size-3.5 shrink-0 text-brand" />
                        {highlight}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-ink-line p-4">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-white/35">
                      Seller
                    </p>
                    <p className="mt-1 text-[13px] font-medium text-white">
                      {property.sellerName}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      Verified seller · 6 assets listed
                    </p>
                  </div>
                  <div className="rounded-xl border border-ink-line p-4">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-white/35">
                      Registry status
                    </p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-soft">
                      <BadgeCheck className="size-4" />
                      {property.status === "pending_verification"
                        ? "Verification in progress"
                        : "Title verified & anchored"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      {property.verifiedAt
                        ? `Verified ${new Date(property.verifiedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
                        : "Awaiting registrar confirmation"}
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="documents">
                <div className="divide-y divide-ink-line/70 overflow-hidden rounded-xl border border-ink-line">
                  {property.documents.map((document) => (
                    <div
                      key={document.id}
                      className="flex flex-wrap items-center gap-3 bg-ink-soft/30 px-4 py-3"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand-soft">
                        <FileText className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-white">
                          {document.name}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] text-white/35">
                          {truncateMiddle(document.hash, 18, 10)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-white/60">{document.size}</p>
                        <p className="text-[10px] text-white/30">
                          {formatDateTime(document.uploadedAt)}
                        </p>
                      </div>
                      <Badge variant="brand" className="shrink-0">
                        <ShieldCheck className="size-3" />
                        Hashed
                      </Badge>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-white/30">
                  Document hashes are anchored on Hedera. Any change to a source file
                  would produce a different hash and fail registry verification.
                </p>
              </TabsContent>

              <TabsContent value="registry" className="space-y-5">
                <div className="rounded-xl border border-ink-line bg-ink-soft/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-white/35">
                      Property hash (SHA-256)
                    </p>
                    <button
                      type="button"
                      onClick={() => copyHash(property.propertyHash)}
                      className="inline-flex items-center gap-1 text-[10px] text-brand-soft hover:underline"
                    >
                      <Copy className="size-3" />
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-brand-soft/80">
                    {property.propertyHash}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-ink-line/70 pt-3 text-[11px] text-ink-muted">
                    <span>
                      Registry tx:{" "}
                      <span className="font-mono text-white/70">
                        {truncateMiddle(property.registryTxId, 14, 8)}
                      </span>
                    </span>
                    <span>
                      Network: <span className="text-white/70">Hedera mainnet</span>
                    </span>
                  </div>
                </div>

                <ol className="relative space-y-4 border-l border-ink-line pl-5">
                  {(record?.timeline ?? []).map((event) => (
                    <li key={event.id} className="relative">
                      <span
                        className={`absolute -left-[26px] top-1 grid size-2.5 place-items-center rounded-full ${
                          event.status === "verified"
                            ? "bg-brand"
                            : event.status === "flagged"
                              ? "bg-red-400"
                              : event.status === "pending"
                                ? "bg-amber-400"
                                : "bg-white/30"
                        }`}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-medium text-white">{event.title}</p>
                        <span className="text-[10px] text-white/30">
                          {formatDateTime(event.timestamp)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">
                        {event.description}
                      </p>
                      {event.hash ? (
                        <p className="mt-1 font-mono text-[10px] text-white/25">
                          {truncateMiddle(event.hash, 16, 8)}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24">
          <InvestmentCalculator property={property} onInvest={startInvestment} />

          <Card className="p-5">
            <h3 className="text-sm font-semibold text-white">Asset summary</h3>
            <dl className="mt-4 space-y-3 text-[12px]">
              <div className="flex items-center justify-between">
                <dt className="text-ink-muted">Total units</dt>
                <dd className="font-medium text-white">{formatNumber(property.totalUnits)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ink-muted">Units available</dt>
                <dd className="font-medium text-white">{formatNumber(remainingUnits)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ink-muted">Ownership unit</dt>
                <dd className="font-medium text-white">
                  {(100 / property.totalUnits).toFixed(3)}%
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ink-muted">Distribution</dt>
                <dd className="font-medium text-white">Quarterly</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ink-muted">Lock-in</dt>
                <dd className="font-medium text-white">None</dd>
              </div>
            </dl>
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-brand/20 bg-brand/[0.06] p-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />
              <p className="text-[11px] leading-relaxed text-brand-soft/80">
                Ownership is issued on-chain after payment confirmation. Units can be
                resold on the marketplace.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) {
            setResult(null);
            setInvestError(null);
          }
        }}
      >
        <DialogContent>
          {result ? (
            <>
              <DialogHeader>
                <div className="mb-2 grid size-11 place-items-center rounded-xl bg-brand/15">
                  <CheckCircle2 className="size-5 text-brand" />
                </div>
                <DialogTitle>Investment confirmed</DialogTitle>
                <DialogDescription>
                  {formatNumber(result.units)} units of {result.propertyTitle} have been
                  issued to your wallet.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2 rounded-xl border border-ink-line bg-ink-soft/50 p-4 text-[12px]">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Amount</span>
                  <span className="font-medium text-white">{formatCurrency(result.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Ownership</span>
                  <span className="font-medium text-white">
                    {result.ownershipPercent.toFixed(3)}%
                  </span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-ink-muted">Transaction</span>
                  <span className="truncate font-mono text-[10px] text-brand-soft/80">
                    {truncateMiddle(result.txHash, 14, 8)}
                  </span>
                </div>
              </div>

              <DialogFooter>
                <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                  Keep browsing
                </Button>
                <Button onClick={() => router.push("/investor")}>
                  <Wallet />
                  View portfolio
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Confirm your investment</DialogTitle>
                <DialogDescription>
                  Review the order before signing. Units are issued after payment
                  confirmation on Hedera.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2 rounded-xl border border-ink-line bg-ink-soft/50 p-4 text-[12px]">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Property</span>
                  <span className="max-w-[60%] text-right font-medium text-white">
                    {property.title}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Units</span>
                  <span className="font-medium text-white">{formatNumber(units)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Price per unit</span>
                  <span className="font-medium text-white">
                    {formatCurrency(property.unitPrice)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-ink-line/70 pt-2">
                  <span className="text-ink-muted">Total payable</span>
                  <span className="font-semibold text-brand-soft">
                    {formatCurrency(units * property.unitPrice)}
                  </span>
                </div>
              </div>

              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-white/35">
                <Calendar className="mt-0.5 size-3.5 shrink-0" />
                Settlements are processed on business days. You can track this investment
                in your portfolio immediately.
              </p>

              {investError ? (
                <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-300">
                  {investError}
                </p>
              ) : null}

              <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={confirmInvestment} loading={investing}>
                  Confirm & invest
                  {!investing ? <ArrowUpRight /> : null}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

export default function PropertyDetailPage() {
  return (
    <React.Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center bg-ink">
          <span className="size-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      }
    >
      <PropertyDetailContent />
    </React.Suspense>
  );
}
