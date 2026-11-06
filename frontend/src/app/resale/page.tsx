"use client";

import * as React from "react";
import {
  ArrowUpRight,
  BadgeIndianRupee,
  CheckCircle2,
  Clock,
  History,
  Plus,
  Store,
  Trash2,
  Users,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { PropertyVisual } from "@/components/property-visual";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  buyResaleListing,
  cancelResaleListing,
  createResaleListing,
  getResaleListings,
} from "@/lib/api/resale";
import { getProperties } from "@/lib/api/properties";
import { useAuth } from "@/components/auth-provider";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
} from "@/lib/utils";
import type { ResaleListing } from "@/lib/types";

export default function ResaleMarketplacePage() {
  const { user } = useAuth();
  const { data: listings, loading, reload } = useApi(() => getResaleListings("all"), []);
  const { data: properties } = useApi(() => getProperties(), []);

  const [tab, setTab] = React.useState("market");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [buyTarget, setBuyTarget] = React.useState<ResaleListing | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<ResaleListing | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({
    propertyId: "",
    units: "",
    pricePerUnit: "",
  });

  const all = listings ?? [];
  const active = all.filter((listing) => listing.status === "active");
  const mine = all.filter((listing) => listing.sellerName === "You");
  const history = all.filter((listing) => listing.status !== "active");

  const totalListedValue = active.reduce((sum, listing) => sum + listing.totalValue, 0);
  const availableUnits = active.reduce((sum, listing) => sum + listing.units, 0);
  const avgPremium = active.length
    ? active.reduce(
        (sum, listing) =>
          sum +
          ((listing.pricePerUnit - listing.originalPricePerUnit) /
            listing.originalPricePerUnit) *
            100,
        0,
      ) / active.length
    : 0;

  const selectedProperty = properties?.find((property) => property.id === form.propertyId);
  const premiumPercent =
    selectedProperty && Number(form.pricePerUnit) > 0
      ? ((Number(form.pricePerUnit) - selectedProperty.unitPrice) / selectedProperty.unitPrice) * 100
      : 0;

  function openCreate() {
    setForm({ propertyId: "", units: "", pricePerUnit: "" });
    setError(null);
    setSuccess(null);
    setCreateOpen(true);
  }

  function selectProperty(propertyId: string) {
    const property = properties?.find((item) => item.id === propertyId);
    setForm((current) => ({
      ...current,
      propertyId,
      pricePerUnit: property ? String(property.unitPrice) : current.pricePerUnit,
    }));
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const listing = await createResaleListing({
        propertyId: form.propertyId,
        units: Number(form.units),
        pricePerUnit: Number(form.pricePerUnit),
        sellerName: user?.name ?? "You",
      });
      setCreateOpen(false);
      setSuccess(
        `${formatNumber(listing.units)} units of ${listing.propertyTitle} listed for ${formatCurrency(listing.totalValue)}.`,
      );
      setTab("mine");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create this listing.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBuy() {
    if (!buyTarget) return;
    setBusy(true);
    setError(null);
    try {
      const purchased = await buyResaleListing(buyTarget.id);
      setSuccess(
        `Purchase confirmed — ${formatNumber(purchased.units)} units of ${purchased.propertyTitle} added to your portfolio.`,
      );
      setBuyTarget(null);
      reload();
      setTab("market");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete this purchase.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    setBusy(true);
    setError(null);
    try {
      await cancelResaleListing(cancelTarget.id);
      setSuccess("Listing cancelled. Your units are back in your portfolio.");
      setCancelTarget(null);
      reload();
      setTab("mine");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel this listing.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardShell requireAuth>
      <PageHeader
        eyebrow="Resale marketplace"
        title="Buy and sell fractional units"
        description="Need liquidity before a project exits? List your units for resale, or pick up verified fractions from other investors at a transparent asking price."
        actions={
          <Button onClick={openCreate}>
            <Plus />
            Create listing
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active listings"
          value={String(active.length)}
          hint={`${formatNumber(availableUnits)} units available`}
          icon={Store}
        />
        <StatCard
          label="Listed value"
          value={formatCurrency(totalListedValue)}
          hint="Aggregate asking price"
          icon={BadgeIndianRupee}
          accent="sky"
        />
        <StatCard
          label="Average premium"
          value={formatPercent(avgPremium, 1)}
          hint="Over original unit price"
          icon={ArrowUpRight}
          accent="violet"
        />
        <StatCard
          label="My listings"
          value={String(mine.length)}
          hint="Created from this device"
          icon={Users}
          accent="amber"
        />
      </div>

      {success ? (
        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-brand/25 bg-brand/[0.08] px-4 py-3">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" />
          <p className="flex-1 text-[12px] leading-relaxed text-brand-soft/90">{success}</p>
          <button
            type="button"
            onClick={() => setSuccess(null)}
            className="text-[11px] text-brand-soft/60 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="market">
            <Store className="size-3.5" />
            Marketplace
          </TabsTrigger>
          <TabsTrigger value="mine">
            <Users className="size-3.5" />
            My listings
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="size-3.5" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="market">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-64 animate-pulse rounded-2xl border border-ink-line bg-ink-card/60"
                />
              ))}
            </div>
          ) : active.length === 0 ? (
            <Card className="grid place-items-center p-12 text-center">
              <span className="grid size-12 place-items-center rounded-xl bg-white/[0.04] text-white/40">
                <Store className="size-5" />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-white">No resale units listed</h3>
              <p className="mt-1 max-w-sm text-[13px] text-ink-muted">
                Check back soon, or list your own units for other investors.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {active.map((listing) => {
                const premium =
                  ((listing.pricePerUnit - listing.originalPricePerUnit) /
                    listing.originalPricePerUnit) *
                  100;
                return (
                  <Card key={listing.id} className="overflow-hidden">
                    <div className="flex gap-4 p-4">
                      <PropertyVisual
                        seed={listing.imageSeed}
                        className="h-24 w-24 shrink-0 rounded-xl"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="truncate text-[14px] font-semibold text-white">
                            {listing.propertyTitle}
                          </h3>
                          <Badge variant={premium >= 0 ? "brand" : "amber"}>
                            {premium >= 0 ? "+" : ""}
                            {premium.toFixed(1)}%
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-[11px] text-ink-muted">
                          {listing.city} · {listing.propertyId}
                        </p>
                        <p className="mt-2 text-[11px] text-white/50">
                          Seller: <span className="text-white/75">{listing.sellerName}</span>
                        </p>
                        <p className="text-[11px] text-white/50">
                          Units:{" "}
                          <span className="text-white/75">{formatNumber(listing.units)}</span>
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 border-t border-ink-line px-4 py-3">
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.1em] text-white/35">
                          Asking / unit
                        </p>
                        <p className="mt-0.5 text-[13px] font-semibold text-white">
                          {formatCurrency(listing.pricePerUnit)}
                        </p>
                        <p className="text-[9px] text-white/30">
                          Original {formatCurrency(listing.originalPricePerUnit)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.1em] text-white/35">
                          Total value
                        </p>
                        <p className="mt-0.5 text-[13px] font-semibold text-white">
                          {formatCurrency(listing.totalValue)}
                        </p>
                        <p className="text-[9px] text-white/30">
                          Listed {formatDate(listing.listedAt)}
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-ink-line px-4 py-3">
                      <Button
                        className="w-full"
                        size="sm"
                        onClick={() => {
                          setError(null);
                          setSuccess(null);
                          setBuyTarget(listing);
                        }}
                      >
                        Buy units
                        <ArrowUpRight />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="mine">
          {mine.length === 0 ? (
            <Card className="grid place-items-center p-12 text-center">
              <span className="grid size-12 place-items-center rounded-xl bg-white/[0.04] text-white/40">
                <Users className="size-5" />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-white">You have no listings</h3>
              <p className="mt-1 max-w-sm text-[13px] text-ink-muted">
                List units from a property you own to offer them to other verified
                investors.
              </p>
              <Button className="mt-5" size="sm" onClick={openCreate}>
                <Plus />
                Create listing
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {mine.map((listing) => (
                <Card key={listing.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[14px] font-semibold text-white">
                        {listing.propertyTitle}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-ink-muted">
                        {listing.city} · {listing.id}
                      </p>
                    </div>
                    <Badge
                      variant={
                        listing.status === "active"
                          ? "brand"
                          : listing.status === "sold"
                            ? "blue"
                            : "slate"
                      }
                    >
                      {listing.status}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-ink-muted">
                    <span>
                      Units <span className="text-white">{formatNumber(listing.units)}</span>
                    </span>
                    <span>
                      Asking{" "}
                      <span className="text-white">
                        {formatCurrency(listing.pricePerUnit)}
                      </span>
                    </span>
                    <span>
                      Total{" "}
                      <span className="text-white">{formatCurrency(listing.totalValue)}</span>
                    </span>
                  </div>
                  {listing.status === "active" ? (
                    <Button
                      variant="danger"
                      size="sm"
                      className="mt-4 w-full"
                      onClick={() => {
                        setError(null);
                        setSuccess(null);
                        setCancelTarget(listing);
                      }}
                    >
                      <Trash2 />
                      Cancel listing
                    </Button>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          <Card className="overflow-hidden">
            {history.length === 0 ? (
              <p className="p-10 text-center text-sm text-ink-muted">
                No completed or cancelled resale activity yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Listing</TableHead>
                    <TableHead>Seller</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Price / unit</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Listed on</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((listing) => (
                    <TableRow key={listing.id}>
                      <TableCell>
                        <p className="text-[12px] font-medium text-white">
                          {listing.propertyTitle}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] text-white/35">
                          {listing.id}
                        </p>
                      </TableCell>
                      <TableCell className="text-[12px] text-white/70">
                        {listing.sellerName}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(listing.units)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(listing.pricePerUnit)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(listing.totalValue)}
                      </TableCell>
                      <TableCell className="text-[11px] text-ink-muted">
                        {formatDate(listing.listedAt)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={listing.status === "sold" ? "blue" : "slate"}
                        >
                          {listing.status === "sold" ? (
                            <CheckCircle2 className="size-3" />
                          ) : (
                            <Clock className="size-3" />
                          )}
                          {listing.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create listing */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a resale listing</DialogTitle>
            <DialogDescription>
              Choose a property, the number of units and your asking price. Buyers pay
              your price; LANDCHAIN settles the transfer on-chain.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Property</Label>
              <Select value={form.propertyId} onValueChange={selectProperty}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  {(properties ?? []).map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.title} · {property.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="resale-units">Units</Label>
                <Input
                  id="resale-units"
                  inputMode="numeric"
                  placeholder="25"
                  value={form.units}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      units: event.target.value.replace(/[^0-9]/g, ""),
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="resale-price">Asking price / unit</Label>
                <Input
                  id="resale-price"
                  inputMode="numeric"
                  placeholder="50000"
                  value={form.pricePerUnit}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      pricePerUnit: event.target.value.replace(/[^0-9]/g, ""),
                    }))
                  }
                  required
                />
              </div>
            </div>

            {selectedProperty ? (
              <div className="rounded-xl border border-ink-line bg-ink-soft/50 p-3.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">Original unit price</span>
                  <span className="text-white">{formatCurrency(selectedProperty.unitPrice)}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-ink-muted">Your premium</span>
                  <span className={premiumPercent >= 0 ? "text-brand-soft" : "text-amber-300"}>
                    {premiumPercent >= 0 ? "+" : ""}
                    {premiumPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between border-t border-ink-line/70 pt-1.5">
                  <span className="text-ink-muted">Total asking value</span>
                  <span className="font-semibold text-white">
                    {formatCurrency(Number(form.units || 0) * Number(form.pricePerUnit || 0))}
                  </span>
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-300">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Publish listing
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Buy */}
      <Dialog open={Boolean(buyTarget)} onOpenChange={(open) => !open && setBuyTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm resale purchase</DialogTitle>
            <DialogDescription>
              {buyTarget
                ? `${formatNumber(buyTarget.units)} units of ${buyTarget.propertyTitle} from ${buyTarget.sellerName}.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {buyTarget ? (
            <div className="space-y-2 rounded-xl border border-ink-line bg-ink-soft/50 p-4 text-[12px]">
              <div className="flex justify-between">
                <span className="text-ink-muted">Asking price / unit</span>
                <span className="text-white">{formatCurrency(buyTarget.pricePerUnit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Units</span>
                <span className="text-white">{formatNumber(buyTarget.units)}</span>
              </div>
              <div className="flex justify-between border-t border-ink-line/70 pt-2">
                <span className="text-ink-muted">Total payable</span>
                <span className="font-semibold text-brand-soft">
                  {formatCurrency(buyTarget.totalValue)}
                </span>
              </div>
              <p className="border-t border-ink-line/70 pt-2 font-mono text-[10px] text-white/30">
                Listing {buyTarget.id}
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-300">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setBuyTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleBuy} loading={busy}>
              Confirm purchase
              <ArrowUpRight />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel */}
      <Dialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this listing?</DialogTitle>
            <DialogDescription>
              {cancelTarget
                ? `${formatNumber(cancelTarget.units)} units of ${cancelTarget.propertyTitle} will be removed from the resale market and remain in your portfolio.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-300">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>
              Keep listing
            </Button>
            <Button variant="danger" onClick={handleCancel} loading={busy}>
              <Trash2 />
              Cancel listing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="mt-6 flex items-center gap-1.5 text-[11px] text-white/25">
        <Clock className="size-3" />
        Resale transfers settle on the next Hedera consensus round. Listing prices are
        set by sellers, not LANDCHAIN.
      </p>
    </DashboardShell>
  );
}
