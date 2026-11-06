"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  FileText,
  Info,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createSellerProperty } from "@/lib/api/seller";
import { CATEGORY_LABELS, CITIES } from "@/lib/constants";
import {
  formatCurrency,
  formatNumber,
  truncateMiddle,
} from "@/lib/utils";
import type { NewPropertyInput, Property, PropertyCategory } from "@/lib/types";

interface UploadedDoc {
  name: string;
  size: string;
  type: string;
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function NewPropertyPage() {
  const [form, setForm] = React.useState({
    title: "",
    description: "",
    address: "",
    city: "",
    state: "",
    category: "residential" as PropertyCategory,
    totalValue: "",
    areaSqft: "",
    minInvestment: "50000",
    expectedYield: "8",
  });
  const [documents, setDocuments] = React.useState<UploadedDoc[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [created, setCreated] = React.useState<Property | null>(null);
  const fileInput = React.useRef<HTMLInputElement | null>(null);

  const totalValue = Number(form.totalValue) || 0;
  const minInvestment = Number(form.minInvestment) || 0;
  const projectedUnits =
    totalValue > 0 && minInvestment > 0 ? Math.round(totalValue / minInvestment) : 0;

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).map((file) => ({
      name: file.name,
      size: formatFileSize(file.size),
      type: file.type.includes("pdf") ? "PDF" : file.type.split("/")[1]?.toUpperCase() ?? "FILE",
    }));
    setDocuments((current) => {
      const existing = new Set(current.map((doc) => doc.name));
      return [...current, ...next.filter((doc) => !existing.has(doc.name))];
    });
    if (fileInput.current) fileInput.current.value = "";
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const input: NewPropertyInput = {
      title: form.title,
      description: form.description,
      address: form.address,
      city: form.city,
      state: form.state,
      category: form.category,
      totalValue,
      areaSqft: Number(form.areaSqft) || 0,
      minInvestment,
      expectedYield: Number(form.expectedYield) || 0,
      documents,
    };

    setLoading(true);
    try {
      const property = await createSellerProperty(input);
      setCreated(property);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit this property.");
    } finally {
      setLoading(false);
    }
  }

  if (created) {
    return (
      <DashboardShell requireAuth roles={["seller"]}>
        <div className="mx-auto max-w-2xl animate-scale-in">
          <Card className="p-8 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand/15">
              <CheckCircle2 className="size-7 text-brand" />
            </div>
            <h1 className="mt-5 text-xl font-semibold text-white">Property submitted</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
              {created.title} is now in the verification queue. Legal ops will review the
              title chain and anchor the asset to Hedera before units go live.
            </p>

            <dl className="mt-6 space-y-2 rounded-xl border border-ink-line bg-ink-soft/40 p-4 text-left text-[12px]">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Property ID</dt>
                <dd className="font-mono text-white">{created.id}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Property hash</dt>
                <dd className="truncate font-mono text-brand-soft/80">
                  {truncateMiddle(created.propertyHash, 16, 10)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Asset value</dt>
                <dd className="text-white">{formatCurrency(created.totalValue)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Units created</dt>
                <dd className="text-white">{formatNumber(created.totalUnits)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Documents hashed</dt>
                <dd className="text-white">{created.documents.length}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Status</dt>
                <dd>
                  <Badge variant="amber">Pending verification</Badge>
                </dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
              <Link href="/seller">
                <Button variant="secondary" className="w-full sm:w-auto">
                  Back to dashboard
                </Button>
              </Link>
              <Link href={`/registry/${created.id}`}>
                <Button className="w-full sm:w-auto">
                  View registry record
                  <ArrowRight />
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell requireAuth roles={["seller"]}>
      <Link
        href="/seller"
        className="mb-5 inline-flex items-center gap-1.5 text-[12px] text-ink-muted transition-colors hover:text-white"
      >
        <ArrowLeft className="size-3.5" />
        Seller dashboard
      </Link>

      <PageHeader
        eyebrow="New listing"
        title="List a property for fractional investment"
        description="Provide the asset details and upload ownership documents. Everything is hashed and sent for registry verification before investors can subscribe."
      />

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Building2 className="size-4 text-brand" />
              Property details
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="title">Property name</Label>
                <Input
                  id="title"
                  placeholder="e.g. Marine Heights Residences"
                  value={form.title}
                  onChange={(event) => update("title", event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the asset, tenancy, amenities and investment rationale…"
                  value={form.description}
                  onChange={(event) => update("description", event.target.value)}
                  rows={4}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  placeholder="Street, locality"
                  value={form.address}
                  onChange={(event) => update("address", event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>City</Label>
                <Select value={form.city} onValueChange={(value) => update("city", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select city" />
                  </SelectTrigger>
                  <SelectContent>
                    {CITIES.map((city) => (
                      <SelectItem key={city} value={city}>
                        {city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  placeholder="e.g. Maharashtra"
                  value={form.state}
                  onChange={(event) => update("state", event.target.value)}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>Asset category</Label>
                <Select
                  value={form.category}
                  onValueChange={(value) => update("category", value as PropertyCategory)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <FileText className="size-4 text-brand" />
              Documents
            </h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
              Upload the sale deed, encumbrance certificate, RERA registration and latest
              tax receipt. Each file is SHA-256 hashed on submission.
            </p>

            <label
              htmlFor="documents"
              className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-ink-line bg-ink-soft/40 px-4 py-8 text-center transition-colors hover:border-brand/40 hover:bg-brand/[0.03]"
            >
              <UploadCloud className="size-6 text-brand/80" />
              <span className="mt-2 text-[13px] font-medium text-white">
                Choose files or drag them here
              </span>
              <span className="mt-1 text-[11px] text-ink-muted">PDF up to 25 MB each</span>
              <input
                ref={fileInput}
                id="documents"
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                className="sr-only"
                onChange={(event) => handleFiles(event.target.files)}
              />
            </label>

            {documents.length > 0 ? (
              <ul className="mt-3 divide-y divide-ink-line/70 rounded-xl border border-ink-line">
                {documents.map((document) => (
                  <li key={document.name} className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand-soft">
                      <FileText className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-white">
                        {document.name}
                      </p>
                      <p className="text-[10px] text-ink-muted">
                        {document.type} · {document.size}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setDocuments((current) =>
                          current.filter((item) => item.name !== document.name),
                        )
                      }
                      className="rounded-md p-1.5 text-white/30 transition-colors hover:bg-red-500/10 hover:text-red-300"
                      aria-label={`Remove ${document.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[11px] text-amber-300/80">
                At least one ownership document is required.
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-24">
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-white">Investment structure</h2>

            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="totalValue">Total property value (₹)</Label>
                <Input
                  id="totalValue"
                  inputMode="numeric"
                  placeholder="25000000"
                  value={form.totalValue}
                  onChange={(event) =>
                    update("totalValue", event.target.value.replace(/[^0-9]/g, ""))
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="area">Built-up area (sq.ft)</Label>
                <Input
                  id="area"
                  inputMode="numeric"
                  placeholder="45000"
                  value={form.areaSqft}
                  onChange={(event) =>
                    update("areaSqft", event.target.value.replace(/[^0-9]/g, ""))
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="minInvestment">Minimum investment (₹)</Label>
                <Input
                  id="minInvestment"
                  inputMode="numeric"
                  value={form.minInvestment}
                  onChange={(event) =>
                    update("minInvestment", event.target.value.replace(/[^0-9]/g, ""))
                  }
                  required
                />
                <p className="text-[10px] text-white/30">
                  Each unit is priced at this amount.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="yield">Target rental yield</Label>
                  <span className="text-[12px] font-semibold text-brand-soft">
                    {Number(form.expectedYield).toFixed(1)}%
                  </span>
                </div>
                <input
                  id="yield"
                  type="range"
                  min={3}
                  max={14}
                  step={0.1}
                  value={form.expectedYield}
                  onChange={(event) => update("expectedYield", event.target.value)}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#10b981]"
                />
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-ink-line bg-ink-soft/50 p-4">
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/35">
                Units created
              </p>
              <p className="mt-1 text-xl font-semibold text-white">
                {formatNumber(projectedUnits)}
              </p>
              <p className="mt-1 text-[11px] text-ink-muted">
                {formatCurrency(minInvestment || 0)} per unit ·{" "}
                {formatCurrency(totalValue)} asset value
              </p>
            </div>

            {error ? (
              <p className="mt-4 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-300">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="mt-5 w-full" loading={loading}>
              Submit for verification
              {!loading ? <ArrowRight /> : null}
            </Button>
          </Card>

          <Card className="p-5">
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 size-4 shrink-0 text-sky-300" />
              <p className="text-[11px] leading-relaxed text-ink-muted">
                By submitting you confirm the documents are authentic and that you are
                authorised to offer the asset for fractional investment. False
                declarations lead to account suspension.
              </p>
            </div>
          </Card>
        </div>
      </form>
    </DashboardShell>
  );
}
