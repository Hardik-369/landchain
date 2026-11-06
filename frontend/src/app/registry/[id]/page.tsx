"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Check,
  Copy,
  FileText,
  Fingerprint,
  History,
  MapPin,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useApi } from "@/lib/hooks/use-api";
import { getRegistryRecord } from "@/lib/api/registry";
import {
  formatArea,
  formatDateTime,
  formatNumber,
  truncateMiddle,
} from "@/lib/utils";

function RegistryRecordContent() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { data: record, loading, error } = useApi(() => getRegistryRecord(id), [id]);
  const [copied, setCopied] = React.useState<string | null>(null);

  function copy(value: string, key: string) {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    });
  }

  if (loading) {
    return (
      <DashboardShell>
        <div className="space-y-4">
          <div className="h-5 w-40 animate-pulse rounded bg-white/5" />
          <div className="h-28 animate-pulse rounded-2xl border border-ink-line bg-ink-card/60" />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-64 animate-pulse rounded-2xl border border-ink-line bg-ink-card/60" />
            <div className="h-64 animate-pulse rounded-2xl border border-ink-line bg-ink-card/60" />
          </div>
        </div>
      </DashboardShell>
    );
  }

  if (error || !record) {
    return (
      <DashboardShell>
        <Card className="mx-auto mt-10 max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold text-white">Registry record unavailable</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {error ?? "This property is not registered on LANDCHAIN."}
          </p>
          <Link href="/registry" className="mt-5 inline-block">
            <Button variant="secondary" size="sm">
              Back to registry
            </Button>
          </Link>
        </Card>
      </DashboardShell>
    );
  }

  const { property, verifications, timeline } = record;

  return (
    <DashboardShell>
      <Link
        href="/registry"
        className="mb-5 inline-flex items-center gap-1.5 text-[12px] text-ink-muted transition-colors hover:text-white"
      >
        <ArrowLeft className="size-3.5" />
        Property registry
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={property.status} />
            <span className="font-mono text-[11px] text-white/35">{property.id}</span>
          </div>
          <h1 className="mt-3 text-[26px] font-semibold tracking-tight text-white sm:text-[30px]">
            {property.title}
          </h1>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-muted">
            <MapPin className="size-4" />
            {property.city}, {property.state} · {formatArea(property.areaSqft)}
          </p>
        </div>
        <Link href={`/buyer/${property.id}`}>
          <Button variant="secondary" size="sm">
            View marketplace listing
            <ArrowUpRight />
          </Button>
        </Link>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Fingerprint className="size-4 text-brand" />
              Property hash
            </h2>
            <button
              type="button"
              onClick={() => copy(property.propertyHash, "property")}
              className="inline-flex items-center gap-1 text-[10px] text-brand-soft hover:underline"
            >
              {copied === "property" ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copied === "property" ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-3 break-all font-mono text-[11px] leading-relaxed text-brand-soft/80">
            {property.propertyHash}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-line pt-4 text-[11px]">
            <div>
              <dt className="text-white/35">Registry transaction</dt>
              <dd className="mt-1 font-mono text-white/80">
                {truncateMiddle(property.registryTxId, 12, 8)}
              </dd>
            </div>
            <div>
              <dt className="text-white/35">Network</dt>
              <dd className="mt-1 text-white/80">Hedera mainnet</dd>
            </div>
            <div>
              <dt className="text-white/35">Anchored</dt>
              <dd className="mt-1 text-white/80">
                {property.verifiedAt ? formatDateTime(property.verifiedAt) : "Pending"}
              </dd>
            </div>
            <div>
              <dt className="text-white/35">Documents hashed</dt>
              <dd className="mt-1 text-white/80">{property.documents.length}</dd>
            </div>
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Building2 className="size-4 text-brand" />
            Asset snapshot
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[11px]">
            <div>
              <dt className="text-white/35">Seller</dt>
              <dd className="mt-1 text-white/85">{property.sellerName}</dd>
            </div>
            <div>
              <dt className="text-white/35">Asset value</dt>
              <dd className="mt-1 text-white/85">
                {Intl.NumberFormat("en-IN", {
                  style: "currency",
                  currency: "INR",
                  maximumFractionDigits: 0,
                }).format(property.totalValue)}
              </dd>
            </div>
            <div>
              <dt className="text-white/35">Units subscribed</dt>
              <dd className="mt-1 text-white/85">
                {formatNumber(property.unitsSold)} / {formatNumber(property.totalUnits)}
              </dd>
            </div>
            <div>
              <dt className="text-white/35">Target yield</dt>
              <dd className="mt-1 text-brand-soft">{property.expectedYield.toFixed(1)}% p.a.</dd>
            </div>
            <div>
              <dt className="text-white/35">Registered records</dt>
              <dd className="mt-1 text-white/85">{timeline.length} events</dd>
            </div>
            <div>
              <dt className="text-white/35">Verified events</dt>
              <dd className="mt-1 text-white/85">
                {verifications.filter((item) => item.status === "verified").length}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-brand/20 bg-brand/[0.06] p-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />
            <p className="text-[11px] leading-relaxed text-brand-soft/80">
              This record is append-only. Verification events cannot be deleted or
              back-dated.
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <FileText className="size-4 text-brand" />
            Document hashes
          </h2>
          <div className="mt-4 divide-y divide-ink-line/70 overflow-hidden rounded-xl border border-ink-line">
            {property.documents.map((document) => (
              <div key={document.id} className="bg-ink-soft/30 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12px] font-medium text-white">{document.name}</p>
                  <button
                    type="button"
                    onClick={() => copy(document.hash, document.id)}
                    className="inline-flex items-center gap-1 text-[10px] text-brand-soft hover:underline"
                  >
                    {copied === document.id ? (
                      <Check className="size-3" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    {copied === document.id ? "Copied" : "Copy hash"}
                  </button>
                </div>
                <p className="mt-1.5 break-all font-mono text-[10px] leading-relaxed text-white/40">
                  {document.hash}
                </p>
                <p className="mt-1 text-[10px] text-white/25">
                  {document.type} · {document.size} · uploaded {formatDateTime(document.uploadedAt)}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <BadgeCheck className="size-4 text-brand" />
            Verification history
          </h2>
          {verifications.length === 0 ? (
            <p className="mt-4 text-[12px] text-ink-muted">
              No verification events recorded yet. The asset is awaiting legal review.
            </p>
          ) : (
            <ol className="mt-4 space-y-4">
              {verifications.map((record) => (
                <li key={record.id} className="rounded-xl border border-ink-line bg-ink-soft/30 p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[12px] font-medium text-white">{record.action}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-muted">
                        <UserRound className="size-3" />
                        {record.actor} · {record.role}
                      </p>
                    </div>
                    <Badge
                      variant={
                        record.status === "verified"
                          ? "brand"
                          : record.status === "flagged"
                            ? "red"
                            : "amber"
                      }
                    >
                      {record.status}
                    </Badge>
                  </div>
                  {record.note ? (
                    <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                      {record.note}
                    </p>
                  ) : null}
                  <p className="mt-2 font-mono text-[9px] text-white/25">
                    {truncateMiddle(record.hash, 18, 10)} · {formatDateTime(record.timestamp)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <History className="size-4 text-brand" />
          Property activity timeline
        </h2>
        <ol className="mt-5 space-y-4 border-l border-ink-line pl-5">
          {timeline.map((event) => (
            <li key={event.id} className="relative">
              <span
                className={`absolute -left-[26px] top-1.5 size-2.5 rounded-full ${
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
                  {truncateMiddle(event.hash, 20, 10)}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </Card>
    </DashboardShell>
  );
}

export default function RegistryRecordPage() {
  return (
    <React.Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center bg-ink">
          <span className="size-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      }
    >
      <RegistryRecordContent />
    </React.Suspense>
  );
}
