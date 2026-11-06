"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  BadgeCheck,
  Ban,
  Building2,
  CheckCircle2,
  FileText,
  IndianRupee,
  Search,
  ShieldAlert,
  Users,
  Wallet,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { AllocationDonut } from "@/components/charts/allocation-donut";
import { SimpleBarChart } from "@/components/charts/bar-chart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApi } from "@/lib/hooks/use-api";
import {
  decideVerification,
  getAdminStats,
  getAdminUsers,
  getPendingVerifications,
} from "@/lib/api/admin";
import { getTransactions } from "@/lib/api/portfolio";
import { getProperties } from "@/lib/api/properties";
import {
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  initials,
  truncateMiddle,
} from "@/lib/utils";
import type { Property } from "@/lib/types";

const KYC_VARIANT = {
  verified: "brand",
  pending: "amber",
  rejected: "red",
  not_started: "slate",
} as const;

function AdminContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "verification";

  const { data: stats, loading: statsLoading } = useApi(() => getAdminStats(), []);
  const { data: users, loading: usersLoading } = useApi(() => getAdminUsers(), []);
  const { data: queue, setData: setQueue, loading: queueLoading } = useApi(
    () => getPendingVerifications(),
    [],
  );
  const { data: transactions, loading: txnLoading } = useApi(() => getTransactions(), []);
  const { data: allProperties, loading: propertiesLoading } = useApi(
    () => getProperties(),
    [],
  );

  const [tab, setTab] = React.useState(initialTab);
  const [search, setSearch] = React.useState("");
  const [decisionTarget, setDecisionTarget] = React.useState<{
    property: Property;
    action: "approve" | "reject";
  } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  function handleTabChange(value: string) {
    setTab(value);
    router.replace(`/admin?tab=${value}`, { scroll: false });
  }

  async function handleDecision() {
    if (!decisionTarget) return;
    setBusy(true);
    try {
      const result = await decideVerification({
        propertyId: decisionTarget.property.id,
        action: decisionTarget.action,
      });
      setQueue((current) =>
        (current ?? []).filter((property) => property.id !== result.propertyId),
      );
      setMessage(
        `${decisionTarget.property.id} ${
          result.status === "verified" ? "approved and anchored" : "rejected"
        }. Reference ${truncateMiddle(result.txHash, 10, 6)}.`,
      );
      setDecisionTarget(null);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to record this decision.",
      );
    } finally {
      setBusy(false);
    }
  }

  const filteredUsers = (users ?? []).filter((user) => {
    const haystack = `${user.name} ${user.email} ${user.mobile} ${user.role}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  return (
    <DashboardShell requireAuth roles={["admin"]}>
      <PageHeader
        eyebrow="Admin console"
        title="Platform operations"
        description="Verify property submissions, manage participants and monitor capital flowing through the marketplace."
        actions={
          <Link href="/registry">
            <Button variant="secondary" size="sm">
              <ShieldAlert />
              Public registry
            </Button>
          </Link>
        }
      />

      {message ? (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-brand/25 bg-brand/[0.08] px-4 py-3">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" />
          <p className="flex-1 text-[12px] leading-relaxed text-brand-soft/90">{message}</p>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-[11px] text-brand-soft/60 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total properties"
          value={statsLoading ? "—" : String(stats?.totalProperties ?? 0)}
          hint="Registered assets"
          icon={Building2}
        />
        <StatCard
          label="Pending verification"
          value={statsLoading ? "—" : String(stats?.pendingVerification ?? 0)}
          hint="Awaiting legal review"
          icon={ShieldAlert}
          accent="amber"
        />
        <StatCard
          label="Platform users"
          value={statsLoading ? "—" : formatNumber(stats?.totalUsers ?? 0)}
          hint="Verified participants"
          icon={Users}
          accent="violet"
        />
        <StatCard
          label="Capital invested"
          value={statsLoading ? "—" : formatCompactCurrency(stats?.totalInvestment ?? 0)}
          hint="Subscribed across assets"
          icon={IndianRupee}
          accent="sky"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Investment volume</h2>
              <p className="mt-1 text-[12px] text-ink-muted">
                Monthly capital deployed across the platform.
              </p>
            </div>
            <Badge variant="brand">Hedera settled</Badge>
          </div>
          <div className="mt-4">
            {stats ? (
              <SimpleBarChart
                data={stats.monthlyVolume}
                dataKey="value"
                label="Volume"
                height={230}
                color="#38bdf8"
              />
            ) : (
              <div className="h-[230px] animate-pulse rounded-xl bg-white/[0.03]" />
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-white">Asset mix</h2>
          <p className="mt-1 text-[12px] text-ink-muted">Share of registered value.</p>
          <div className="mt-5">
            {stats ? (
              <AllocationDonut data={stats.categorySplit} centerLabel="Assets" />
            ) : (
              <div className="h-[190px] animate-pulse rounded-xl bg-white/[0.03]" />
            )}
          </div>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="mt-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="verification">
            <BadgeCheck className="size-3.5" />
            Verification
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="size-3.5" />
            Users
          </TabsTrigger>
          <TabsTrigger value="investments">
            <Building2 className="size-3.5" />
            Investments
          </TabsTrigger>
          <TabsTrigger value="transactions">
            <Wallet className="size-3.5" />
            Transactions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="verification">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Property verification queue</h2>
                <p className="mt-1 text-[12px] text-ink-muted">
                  Approve only after title diligence and document hash checks are complete.
                </p>
              </div>
              <Badge variant="amber">{queue?.length ?? 0} in queue</Badge>
            </div>

            {queueLoading ? (
              <div className="mt-4 space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-20 animate-pulse rounded-xl bg-white/[0.03]" />
                ))}
              </div>
            ) : (queue ?? []).length === 0 ? (
              <div className="mt-6 rounded-xl border border-brand/20 bg-brand/[0.05] p-8 text-center">
                <CheckCircle2 className="mx-auto size-6 text-brand" />
                <p className="mt-2 text-sm font-medium text-white">Queue is clear</p>
                <p className="mt-1 text-[12px] text-ink-muted">
                  Every submitted asset has a verification decision.
                </p>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {(queue ?? []).map((property) => (
                  <li
                    key={property.id}
                    className="flex flex-col gap-4 rounded-xl border border-ink-line bg-ink-soft/30 p-4 lg:flex-row lg:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-semibold text-white">
                          {property.title}
                        </p>
                        <StatusPill status={property.status} />
                        <span className="font-mono text-[10px] text-white/30">
                          {property.id}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-ink-muted">
                        {property.city}, {property.state} · {formatCurrency(property.totalValue)} ·{" "}
                        {property.sellerName}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-white/35">
                        <span className="inline-flex items-center gap-1">
                          <FileText className="size-3" />
                          {property.documents.length} documents hashed
                        </span>
                        <span className="font-mono">
                          {truncateMiddle(property.propertyHash, 12, 6)}
                        </span>
                        <span>Submitted {formatDate(property.createdAt)}</span>
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <Link href={`/registry/${property.id}`}>
                        <Button variant="ghost" size="sm">
                          Inspect
                          <ArrowUpRight />
                        </Button>
                      </Link>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setDecisionTarget({ property, action: "reject" })}
                      >
                        <Ban />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setDecisionTarget({ property, action: "approve" })}
                      >
                        <BadgeCheck />
                        Approve
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">User management</h2>
                <p className="mt-1 text-[12px] text-ink-muted">
                  KYC status, wallets and roles for every participant.
                </p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-white/30" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search users…"
                  className="h-9 pl-9 text-[12px]"
                  aria-label="Search users"
                />
              </div>
            </div>

            <div className="mt-4">
              {usersLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="h-12 animate-pulse rounded-lg bg-white/[0.03]" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Mobile</TableHead>
                      <TableHead>KYC</TableHead>
                      <TableHead>Wallet</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[10px] font-semibold text-white/70">
                              {initials(user.name)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-medium text-white">
                                {user.name}
                              </p>
                              <p className="truncate text-[10px] text-white/35">
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.role === "admin" ? "blue" : "slate"}>
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-[11px] text-white/70">
                          {user.mobile}
                        </TableCell>
                        <TableCell>
                          <Badge variant={KYC_VARIANT[user.kycStatus]}>
                            {user.kycStatus.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-white/40">
                          {user.walletAddress
                            ? truncateMiddle(user.walletAddress, 8, 6)
                            : "Not linked"}
                        </TableCell>
                        <TableCell className="text-[11px] text-ink-muted">
                          {formatDate(user.joinedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="investments">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-white">Investment monitoring</h2>
            <p className="mt-1 text-[12px] text-ink-muted">
              Subscribed capital and funding progress per property.
            </p>

            <div className="mt-4">
              <InvestmentTable
                properties={allProperties ?? []}
                loading={propertiesLoading}
              />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-white">Transaction monitoring</h2>
            <p className="mt-1 text-[12px] text-ink-muted">
              Recent ledger entries across investments, distributions and resale.
            </p>

            <div className="mt-4">
              {txnLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="h-12 animate-pulse rounded-lg bg-white/[0.03]" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(transactions ?? []).map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="font-mono text-[10px] text-white/40">
                          {transaction.id}
                        </TableCell>
                        <TableCell>
                          <Badge variant="slate">
                            {transaction.type.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[12px] text-white/80">
                          {transaction.description}
                        </TableCell>
                        <TableCell className="text-[11px] text-ink-muted">
                          {formatDate(transaction.date)}
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
                        <TableCell className="text-right text-[12px] font-medium text-white">
                          {formatCurrency(transaction.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={Boolean(decisionTarget)}
        onOpenChange={(open) => !open && setDecisionTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisionTarget?.action === "approve" ? "Approve property" : "Reject property"}
            </DialogTitle>
            <DialogDescription>
              {decisionTarget
                ? `${decisionTarget.property.title} (${decisionTarget.property.id}) will be ${
                    decisionTarget.action === "approve"
                      ? "marked verified and anchored to the registry."
                      : "rejected and removed from the investment queue."
                  }`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {decisionTarget ? (
            <div className="space-y-1.5 rounded-xl border border-ink-line bg-ink-soft/50 p-4 text-[11px]">
              <div className="flex justify-between">
                <span className="text-ink-muted">Seller</span>
                <span className="text-white">{decisionTarget.property.sellerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Documents</span>
                <span className="text-white">
                  {decisionTarget.property.documents.length} hashed
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-ink-muted">Property hash</span>
                <span className="truncate font-mono text-brand-soft/70">
                  {truncateMiddle(decisionTarget.property.propertyHash, 14, 8)}
                </span>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDecisionTarget(null)}>
              Cancel
            </Button>
            <Button
              variant={decisionTarget?.action === "reject" ? "danger" : "primary"}
              loading={busy}
              onClick={handleDecision}
            >
              {decisionTarget?.action === "approve" ? (
                <>
                  <BadgeCheck />
                  Confirm approval
                </>
              ) : (
                <>
                  <Ban />
                  Confirm rejection
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

function InvestmentTable({
  properties,
  loading,
}: {
  properties: Property[];
  loading: boolean;
}) {
  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-white/[0.03]" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Property</TableHead>
          <TableHead className="text-right">Asset value</TableHead>
          <TableHead className="text-right">Units sold</TableHead>
          <TableHead className="text-right">Capital raised</TableHead>
          <TableHead className="text-right">Funding</TableHead>
          <TableHead className="text-right">Yield</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {properties.map((property) => {
          const funded = Math.round((property.unitsSold / property.totalUnits) * 100);
          return (
            <TableRow key={property.id}>
              <TableCell>
                <p className="text-[12px] font-medium text-white">{property.title}</p>
                <p className="mt-0.5 font-mono text-[10px] text-white/35">
                  {property.id} · {property.city}
                </p>
              </TableCell>
              <TableCell className="text-right text-[12px]">
                {formatCompactCurrency(property.totalValue)}
              </TableCell>
              <TableCell className="text-right text-[12px]">
                {formatNumber(property.unitsSold)} / {formatNumber(property.totalUnits)}
              </TableCell>
              <TableCell className="text-right text-[12px] text-white">
                {formatCompactCurrency(property.unitsSold * property.unitPrice)}
              </TableCell>
              <TableCell className="text-right text-[12px] text-brand-soft">
                {funded}%
              </TableCell>
              <TableCell className="text-right text-[12px] text-white/80">
                {formatPercent(property.expectedYield)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export default function AdminPage() {
  return (
    <React.Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center bg-ink">
          <span className="size-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      }
    >
      <AdminContent />
    </React.Suspense>
  );
}
