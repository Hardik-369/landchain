"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Building2,
  Layers,
  PieChart,
  Plus,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { AllocationDonut } from "@/components/charts/allocation-donut";
import { PortfolioPerformance } from "@/components/charts/portfolio-performance";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApi } from "@/lib/hooks/use-api";
import {
  getInvestments,
  getPortfolioSummary,
  getTransactions,
} from "@/lib/api/portfolio";
import {
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  truncateMiddle,
} from "@/lib/utils";

const TXN_LABELS: Record<string, string> = {
  investment: "Investment",
  payout: "Rental payout",
  resale_purchase: "Resale purchase",
  resale_sale: "Resale sale",
  refund: "Refund",
};

export default function InvestorDashboardPage() {
  const { data: summary, loading: summaryLoading } = useApi(
    () => getPortfolioSummary(),
    [],
  );
  const { data: investments, loading: investmentsLoading } = useApi(
    () => getInvestments(),
    [],
  );
  const { data: transactions, loading: transactionsLoading } = useApi(
    () => getTransactions(),
    [],
  );

  return (
    <DashboardShell requireAuth roles={["investor", "admin"]}>
      <PageHeader
        eyebrow="Investor portfolio"
        title="Your ownership at a glance"
        description="Every unit you hold is registered against a verified property hash. Track distributions, ownership percentages and the full transaction ledger."
        actions={
          <Link href="/buyer">
            <Button>
              <Plus />
              Invest more
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total invested"
          value={summary ? formatCompactCurrency(summary.totalInvested) : "—"}
          hint={`${summary?.propertiesCount ?? 0} properties`}
          icon={Wallet}
        />
        <StatCard
          label="Current value"
          value={summary ? formatCompactCurrency(summary.currentValue) : "—"}
          hint="Marked to latest valuation"
          icon={TrendingUp}
          accent="sky"
          delta={
            summary
              ? {
                  value: `+${formatPercent(
                    summary.totalInvested
                      ? (summary.totalReturns / summary.totalInvested) * 100
                      : 0,
                  )}`,
                  direction: "up",
                }
              : undefined
          }
        />
        <StatCard
          label="Units held"
          value={summary ? formatNumber(summary.totalUnits) : "—"}
          hint="Across all properties"
          icon={Layers}
          accent="violet"
        />
        <StatCard
          label="Rental income / mo"
          value={summary ? formatCompactCurrency(summary.monthlyRentalIncome) : "—"}
          hint="Paid quarterly"
          icon={Banknote}
          accent="amber"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Portfolio performance</h2>
              <p className="mt-1 text-[12px] text-ink-muted">
                Invested capital vs. current value, last six months.
              </p>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="inline-flex items-center gap-1.5 text-ink-muted">
                <span className="size-2 rounded-full bg-brand" /> Value
              </span>
              <span className="inline-flex items-center gap-1.5 text-ink-muted">
                <span className="size-2 rounded-full bg-sky-400" /> Invested
              </span>
            </div>
          </div>
          <div className="mt-4">
            {summaryLoading || !summary ? (
              <div className="h-[260px] animate-pulse rounded-xl bg-white/[0.03]" />
            ) : (
              <PortfolioPerformance data={summary.performance} />
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-white">Allocation by asset class</h2>
          <p className="mt-1 text-[12px] text-ink-muted">
            Diversification of invested capital.
          </p>
          <div className="mt-6">
            {summaryLoading || !summary ? (
              <div className="h-[190px] animate-pulse rounded-xl bg-white/[0.03]" />
            ) : (
              <AllocationDonut data={summary.allocation} />
            )}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-ink-line pt-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/35">
                Total returns
              </p>
              <p className="mt-1 text-sm font-semibold text-brand-soft">
                {summary ? formatCurrency(summary.totalReturns) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/35">
                Avg. ownership
              </p>
              <p className="mt-1 text-sm font-semibold text-white">
                {summary ? formatPercent(summary.avgOwnershipPercent, 2) : "—"}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <Tabs defaultValue="holdings">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="holdings">
                <Building2 className="size-3.5" />
                Holdings
              </TabsTrigger>
              <TabsTrigger value="transactions">
                <ArrowUpRight className="size-3.5" />
                Transactions
              </TabsTrigger>
            </TabsList>
            <span className="text-[11px] text-white/35">
              {investments?.length ?? 0} positions · {transactions?.length ?? 0} ledger entries
            </span>
          </div>

          <TabsContent value="holdings">
            {investmentsLoading ? (
              <div className="space-y-2 py-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-12 animate-pulse rounded-lg bg-white/[0.03]" />
                ))}
              </div>
            ) : investments && investments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Property</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Invested</TableHead>
                    <TableHead className="text-right">Ownership</TableHead>
                    <TableHead>Purchased</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Registry</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investments.map((investment) => (
                    <TableRow key={investment.id}>
                      <TableCell>
                        <p className="text-[13px] font-medium text-white">
                          {investment.propertyTitle}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] text-white/35">
                          {investment.id} · {investment.propertyId}
                        </p>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(investment.units)}</TableCell>
                      <TableCell className="text-right font-medium text-white">
                        {formatCurrency(investment.amount)}
                      </TableCell>
                      <TableCell className="text-right text-brand-soft">
                        {formatPercent(investment.ownershipPercent, 3)}
                      </TableCell>
                      <TableCell className="text-ink-muted">
                        {formatDate(investment.purchasedAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={investment.status === "confirmed" ? "brand" : "amber"}>
                          {investment.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/registry/${investment.propertyId}`}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-soft hover:underline"
                        >
                          View
                          <ArrowUpRight className="size-3" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="grid place-items-center py-14 text-center">
                <span className="grid size-12 place-items-center rounded-xl bg-white/[0.04] text-white/40">
                  <PieChart className="size-5" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-white">No holdings yet</h3>
                <p className="mt-1 max-w-sm text-[13px] text-ink-muted">
                  Browse the marketplace and buy your first fractional units.
                </p>
                <Link href="/buyer" className="mt-4">
                  <Button size="sm">Explore marketplace</Button>
                </Link>
              </div>
            )}
          </TabsContent>

          <TabsContent value="transactions">
            {transactionsLoading ? (
              <div className="space-y-2 py-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-12 animate-pulse rounded-lg bg-white/[0.03]" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(transactions ?? []).map((transaction) => {
                    const inflow = transaction.amount > 0;
                    return (
                      <TableRow key={transaction.id}>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-[12px] text-white/80">
                            <span
                              className={`grid size-6 place-items-center rounded-md ${
                                inflow
                                  ? "bg-brand/10 text-brand-soft"
                                  : "bg-sky-400/10 text-sky-300"
                              }`}
                            >
                              {inflow ? (
                                <ArrowDownLeft className="size-3" />
                              ) : (
                                <ArrowUpRight className="size-3" />
                              )}
                            </span>
                            {TXN_LABELS[transaction.type] ?? transaction.type}
                          </span>
                        </TableCell>
                        <TableCell className="text-[12px] text-white/80">
                          {transaction.description}
                        </TableCell>
                        <TableCell className="text-[11px] text-ink-muted">
                          {formatDate(transaction.date)}
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-white/35">
                          {truncateMiddle(transaction.reference, 10, 6)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              transaction.status === "completed"
                                ? "brand"
                                : transaction.status === "pending"
                                  ? "amber"
                                  : "red"
                            }
                          >
                            {transaction.status}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            inflow ? "text-brand-soft" : "text-white"
                          }`}
                        >
                          {inflow ? "+" : "−"}
                          {formatCurrency(Math.abs(transaction.amount))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </Card>
    </DashboardShell>
  );
}
