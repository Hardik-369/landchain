"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  FileCheck2,
  Fingerprint,
  Search,
  ShieldCheck,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApi } from "@/lib/hooks/use-api";
import { getRegistryEntries } from "@/lib/api/registry";
import { formatDate, truncateMiddle } from "@/lib/utils";

export default function RegistryPage() {
  const { data: entries, loading, error } = useApi(() => getRegistryEntries(), []);
  const [query, setQuery] = React.useState("");

  const list = entries ?? [];
  const filtered = list.filter((entry) => {
    const haystack = `${entry.id} ${entry.title} ${entry.city} ${entry.propertyHash}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const totalDocuments = list.reduce((sum, entry) => sum + entry.documentsCount, 0);
  const pending = list.filter((entry) => entry.status === "pending_verification").length;

  return (
    <DashboardShell>
      <PageHeader
        eyebrow="On-chain registry"
        title="Property registry"
        description="A public, tamper-evident record of every asset on LANDCHAIN. Property hashes, uploaded document hashes and verification events are anchored on the Hedera Consensus Service."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand/[0.08] px-3 py-1.5 text-[11px] font-medium text-brand-soft">
            <span className="size-1.5 animate-pulse rounded-full bg-brand" />
            Hedera mainnet · synced
          </span>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Registered properties"
          value={String(list.length)}
          hint="Across 14 cities"
          icon={Building2}
        />
        <StatCard
          label="Anchored property hashes"
          value={String(list.filter((entry) => entry.status !== "pending_verification").length)}
          hint="SHA-256 · immutable"
          icon={Fingerprint}
          accent="sky"
        />
        <StatCard
          label="Document hashes"
          value={String(totalDocuments)}
          hint="Deeds, ECs, RERA filings"
          icon={FileCheck2}
          accent="violet"
        />
        <StatCard
          label="Pending verification"
          value={String(pending)}
          hint="In legal review"
          icon={ShieldCheck}
          accent="amber"
        />
      </div>

      <Card className="mt-6 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/30" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search property ID, title, city or hash…"
              className="pl-10"
              aria-label="Search registry"
            />
          </div>
          <p className="text-[11px] text-ink-muted">
            Showing {filtered.length} of {list.length} records
          </p>
        </div>
      </Card>

      <Card className="mt-4 overflow-hidden">
        {error ? (
          <p className="p-6 text-sm text-red-300">{error}</p>
        ) : loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-white/[0.03]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-ink-muted">
            No registry records match that search.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead>Property hash</TableHead>
                <TableHead className="text-right">Documents</TableHead>
                <TableHead className="text-right">Verifications</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <p className="text-[13px] font-medium text-white">{entry.title}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-white/35">
                      {entry.id} · {entry.city}
                    </p>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-[10px] text-brand-soft/70">
                      {truncateMiddle(entry.propertyHash, 14, 10)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-[12px]">
                    {entry.documentsCount}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={entry.verificationsCount > 1 ? "brand" : "amber"}>
                      {entry.verificationsCount} verified
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <StatusPill status={entry.status} />
                  </TableCell>
                  <TableCell className="text-[11px] text-ink-muted">
                    {formatDate(entry.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/registry/${entry.id}`}
                      className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-brand-soft hover:underline"
                    >
                      Open record
                      <ArrowUpRight className="size-3" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <p className="mt-4 text-[11px] leading-relaxed text-white/30">
        Registry records are append-only. A change in any source document produces a new
        hash and requires a fresh verification event, which remains permanently visible.
      </p>
    </DashboardShell>
  );
}
