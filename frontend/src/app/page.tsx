"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Coins,
  FileCheck2,
  Fingerprint,
  Layers,
  Lock,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PropertyCard } from "@/components/property-card";
import { PropertyVisual } from "@/components/property-visual";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useApi } from "@/lib/hooks/use-api";
import { getFeaturedProperties } from "@/lib/api/properties";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils";

const STATS = [
  { value: "₹428 Cr", label: "Assets tokenised" },
  { value: "8,400+", label: "Verified investors" },
  { value: "42", label: "Properties registered" },
  { value: "100%", label: "Title hashes anchored" },
];

const STEPS = [
  {
    icon: Wallet,
    title: "Verify & connect",
    description:
      "Register with your mobile number, complete PAN verification and connect a wallet. Access is granted in under three minutes.",
  },
  {
    icon: Building2,
    title: "Choose a property",
    description:
      "Browse RERA-registered assets with full title chains, valuation reports and target yields before you commit capital.",
  },
  {
    icon: Coins,
    title: "Buy fractional units",
    description:
      "Invest from ₹25,000. Units are minted against a registered property hash, so ownership is provable and transferable.",
  },
  {
    icon: TrendingUp,
    title: "Earn & exit",
    description:
      "Track rental distributions in your portfolio and list your units on the resale market whenever you need liquidity.",
  },
];

const HEDERA_POINTS = [
  {
    icon: Fingerprint,
    title: "Immutable title registry",
    description:
      "Every sale deed, encumbrance certificate and approval is SHA-256 hashed and anchored to the Hedera Consensus Service.",
  },
  {
    icon: Layers,
    title: "Tokenised ownership units",
    description:
      "Each fraction maps 1:1 to a registered unit. Holdings reconcile against the on-chain supply at all times.",
  },
  {
    icon: Lock,
    title: "Programmable settlements",
    description:
      "Smart contracts release capital to sellers only after registry verification and disburse rental income pro-rata.",
  },
  {
    icon: FileCheck2,
    title: "Auditable history",
    description:
      "Every verification event carries a consensus timestamp, so diligence never depends on a single custodian.",
  },
];

function HeroVisual() {
  const funded = 86;
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="absolute -inset-6 rounded-[32px] bg-brand/[0.07] blur-2xl" />
      <div className="relative rounded-3xl border border-white/10 bg-ink-card/90 p-3 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9)] backdrop-blur">
        <div className="relative overflow-hidden rounded-2xl">
          <PropertyVisual seed={3} category="commercial" className="h-52 w-full" />
          <div className="absolute left-3 top-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-ink/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-brand-soft backdrop-blur-md">
              <BadgeCheck className="size-3.5" />
              Hedera verified
            </span>
          </div>
        </div>
        <div className="px-3 pb-2 pt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.12em] text-ink-muted">
                Featured asset
              </p>
              <h3 className="mt-1 text-lg font-semibold text-white">Cyber Park Tower A</h3>
              <p className="text-xs text-ink-muted">Whitefield, Bengaluru</p>
            </div>
            <StatusPill status="funded" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-ink-line bg-ink-soft/60 p-3">
            <div>
              <p className="text-[9px] uppercase tracking-[0.1em] text-white/35">Min</p>
              <p className="mt-1 text-[13px] font-semibold text-white">₹75,000</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-[0.1em] text-white/35">Yield</p>
              <p className="mt-1 text-[13px] font-semibold text-brand-soft">9.6%</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-[0.1em] text-white/35">Units</p>
              <p className="mt-1 text-[13px] font-semibold text-white">2,480</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-ink-muted">{funded}% funded</span>
              <span className="font-medium text-white">₹18.6 Cr raised</span>
            </div>
            <Progress value={funded} className="mt-1.5 h-1.5" />
          </div>
        </div>
      </div>

      <div className="absolute -bottom-6 -left-3 hidden w-56 rounded-xl border border-ink-line bg-ink/95 p-3 backdrop-blur-xl sm:block lg:-left-8">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-brand-soft">
          <ShieldCheck className="size-3.5" /> Registry anchor
        </div>
        <p className="mt-2 break-all font-mono text-[9px] leading-relaxed text-white/40">
          0x8f2ac91d4b7e6c05a1d3…e4b7
        </p>
        <p className="mt-1.5 text-[10px] text-ink-muted">Consensus · 2026-10-27 14:10 UTC</p>
      </div>

      <div className="absolute -right-2 -top-5 hidden rounded-xl border border-brand/25 bg-brand/[0.09] px-3 py-2 backdrop-blur-xl sm:block lg:-right-6">
        <p className="text-[9px] uppercase tracking-[0.1em] text-brand-soft/80">Distribution</p>
        <p className="mt-0.5 text-sm font-semibold text-white">+₹64,500</p>
        <p className="text-[9px] text-brand-soft/70">Quarterly payout credited</p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { data: featured, loading } = useApi(() => getFeaturedProperties(3), []);

  return (
    <div className="min-h-dvh bg-ink">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 grid-overlay" />
        <div className="pointer-events-none absolute -left-40 top-10 size-[420px] rounded-full bg-brand/[0.09] blur-[120px]" />
        <div className="pointer-events-none absolute right-0 top-0 size-[360px] rounded-full bg-sky-500/[0.07] blur-[120px]" />

        <div className="relative mx-auto grid max-w-7xl gap-14 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-8 lg:pb-28 lg:pt-20">
          <div className="animate-fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-brand" />
              </span>
              Hedera-powered ownership registry
              <span className="text-white/25">·</span>
              <span className="text-brand-soft">RERA verified</span>
            </div>

            <h1 className="mt-6 text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-[56px] lg:text-[62px]">
              Own real estate.
              <br />
              <span className="text-gradient">Not just a slice of a fund.</span>
            </h1>

            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink-muted sm:text-base">
              LANDCHAIN lets you buy registered fractions of premium Indian property
              from ₹25,000. Every title, document and unit is verified and anchored
              on-chain — so ownership is transparent, liquid and yours.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/buyer">
                <Button size="lg">
                  Explore properties
                  <ArrowRight />
                </Button>
              </Link>
              <Link href="#how-it-works">
                <Button variant="secondary" size="lg">
                  How it works
                </Button>
              </Link>
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-brand" /> SEBI-compliant structure
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-brand" /> Escrow-backed settlements
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-brand" /> Start from ₹25,000
              </span>
            </div>
          </div>

          <div className="animate-fade-up animate-delay-2">
            <HeroVisual />
          </div>
        </div>

        <div className="relative mx-auto max-w-7xl px-5 pb-14 sm:px-8">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-line bg-ink-line/60 sm:grid-cols-4">
            {STATS.map((stat) => (
              <div key={stat.label} className="bg-ink-soft px-5 py-5">
                <p className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                  {stat.value}
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-ink-muted">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured properties */}
      <section className="relative border-t border-ink-line bg-ink py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-soft">
                Featured opportunities
              </p>
              <h2 className="mt-3 text-[30px] font-semibold leading-tight tracking-tight text-white sm:text-4xl">
                Verified assets, open for investment
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
                Each listing has cleared title diligence, independent valuation and a
                registry anchor before a single unit is offered.
              </p>
            </div>
            <Link href="/buyer">
              <Button variant="outline">
                View all 15 properties
                <ArrowUpRight />
              </Button>
            </Link>
          </div>

          <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {loading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-[400px] animate-pulse rounded-2xl border border-ink-line bg-ink-card/60"
                  />
                ))
              : featured?.map((property) => (
                  <PropertyCard key={property.id} property={property} />
                ))}
          </div>
        </div>
      </section>

      {/* How it works — light section */}
      <section id="how-it-works" className="bg-mist py-20 text-ink">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-deep">
              How it works
            </p>
            <h2 className="mt-3 text-[30px] font-semibold leading-tight tracking-tight sm:text-4xl">
              From verification to distribution, in four steps
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              A single workflow for buyers, sellers and investors — with the same
              registry record visible to everyone.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="group relative rounded-2xl border border-slate-200 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_24px_50px_-30px_rgba(4,120,87,0.4)]"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid size-11 place-items-center rounded-xl bg-brand/10 text-brand-deep">
                      <Icon className="size-5" />
                    </span>
                    <span className="text-[11px] font-semibold tracking-[0.12em] text-slate-300">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-[15px] font-semibold text-ink">{step.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/auth">
              <Button variant="light">
                Create your account
                <ArrowRight />
              </Button>
            </Link>
            <Link
              href="/registry"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-deep hover:underline"
            >
              Inspect the public registry
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Hedera section */}
      <section className="relative overflow-hidden border-y border-ink-line bg-ink-soft py-20">
        <div className="pointer-events-none absolute -right-32 top-0 size-[460px] rounded-full bg-brand/[0.08] blur-[130px]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_0.95fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/[0.08] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-soft">
              <Sparkles className="size-3.5" />
              Hedera integration
            </div>
            <h2 className="mt-5 text-[30px] font-semibold leading-tight tracking-tight text-white sm:text-4xl">
              A property registry that can&apos;t be quietly rewritten
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-muted">
              Land records should not live in one spreadsheet. LANDCHAIN writes every
              verification event to the Hedera Consensus Service, giving buyers,
              sellers and regulators the same tamper-evident record.
            </p>

            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              {HEDERA_POINTS.map((point) => {
                const Icon = point.icon;
                return (
                  <div key={point.title}>
                    <span className="grid size-9 place-items-center rounded-lg border border-ink-line bg-ink-card text-brand-soft">
                      <Icon className="size-4" />
                    </span>
                    <h3 className="mt-3 text-sm font-semibold text-white">{point.title}</h3>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
                      {point.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative">
            <div className="rounded-2xl border border-ink-line bg-ink-card p-5 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]">
              <div className="flex items-center justify-between border-b border-ink-line pb-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-ink-muted">
                    Consensus records
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-white">
                    Property registry · Live
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand/[0.08] px-2.5 py-1 text-[10px] font-medium text-brand-soft">
                  <span className="size-1.5 animate-pulse rounded-full bg-brand" />
                  Synced
                </span>
              </div>

              <ul className="mt-3 divide-y divide-ink-line/70">
                {[
                  ["Sale deed anchored", "LAND-2026-001", "14:10:22 UTC"],
                  ["Title diligence approved", "LAND-2026-005", "12:04:51 UTC"],
                  ["Ownership unit minted", "LAND-2026-003", "09:48:07 UTC"],
                  ["Rental distribution settled", "LAND-2026-008", "06:15:39 UTC"],
                ].map(([action, id, time]) => (
                  <li key={id} className="flex items-center gap-3 py-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand-soft">
                      <CheckCircle2 className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-white">{action}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-ink-muted">
                        {id} · {time}
                      </p>
                    </div>
                    <ArrowUpRight className="size-3.5 text-white/25" />
                  </li>
                ))}
              </ul>

              <div className="mt-2 rounded-xl border border-ink-line bg-ink-soft/70 p-3">
                <p className="text-[10px] uppercase tracking-[0.1em] text-ink-muted">
                  Latest hash
                </p>
                <p className="mt-1.5 break-all font-mono text-[10px] leading-relaxed text-brand-soft/80">
                  a7f3c9d21b8e4056f1c2a9d7b3e6084c5a2f9d1e7b4c0a8f3e6d2b9c5a1f7e40
                </p>
              </div>
            </div>

            <div className="absolute -bottom-5 left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-ink-line bg-ink px-4 py-2 text-[11px] text-ink-muted shadow-xl sm:flex">
              <ShieldCheck className="size-3.5 text-brand" />
              Powered by Hedera Consensus Service
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-ink py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-brand/20 bg-gradient-to-br from-brand/[0.14] via-ink-card to-ink px-6 py-12 sm:px-12">
            <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-brand/20 blur-[100px]" />
            <div className="relative max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-soft">
                Start with ₹25,000
              </p>
              <h2 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight text-white sm:text-4xl">
                Your first square foot is closer than you think.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-white/60">
                Create an account, complete PAN verification and browse every registered
                asset in the marketplace. No lock-in to start investing.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/auth">
                  <Button size="lg">
                    Open an account
                    <ArrowRight />
                  </Button>
                </Link>
                <Link href="/buyer">
                  <Button variant="secondary" size="lg">
                    Browse the marketplace
                  </Button>
                </Link>
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-white/40">
                <span>Min. investment {formatCurrency(25_000)}</span>
                <span>·</span>
                <span>Assets up to {formatCompactCurrency(21_50_00_000)}</span>
                <span>·</span>
                <span>Quarterly distributions</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
