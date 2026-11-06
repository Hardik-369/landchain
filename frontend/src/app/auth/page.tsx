"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Briefcase, Building2, ShieldCheck, Store, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestOtp } from "@/lib/api/auth";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

const ROLES: { value: UserRole; label: string; description: string; icon: typeof UserRound }[] = [
  {
    value: "investor",
    label: "Investor",
    description: "Buy and manage fractional units",
    icon: Briefcase,
  },
  {
    value: "buyer",
    label: "Buyer",
    description: "Explore and compare properties",
    icon: Store,
  },
  {
    value: "seller",
    label: "Seller",
    description: "List a property for tokenisation",
    icon: Building2,
  },
  {
    value: "admin",
    label: "Admin",
    description: "Verify assets and monitor activity",
    icon: ShieldCheck,
  },
];

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mobile, setMobile] = React.useState("");
  const [role, setRole] = React.useState<UserRole>("investor");
  const [accepted, setAccepted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const next = searchParams.get("next");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!/^[6-9]\d{9}$/.test(mobile)) {
      setError("Enter a valid 10-digit Indian mobile number starting with 6–9.");
      return;
    }
    if (!accepted) {
      setError("Please accept the terms and KYC consent to continue.");
      return;
    }

    setLoading(true);
    try {
      const result = await requestOtp(mobile);
      const params = new URLSearchParams({
        mobile,
        role,
        requestId: result.requestId,
      });
      if (result.devOtp) params.set("demoOtp", result.devOtp);
      if (next) params.set("next", next);
      router.push(`/auth/verify?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send the OTP. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-soft">
        Create your account
      </p>
      <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight text-white sm:text-[32px]">
        Verify your mobile number
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        We&apos;ll send a 6-digit OTP to confirm your number. Already registered?{" "}
        <Link href="/auth?mode=signin" className="text-brand-soft hover:underline">
          Sign in
        </Link>
        .
      </p>

      <form onSubmit={handleSubmit} className="mt-7 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="mobile">Mobile number</Label>
          <div className="flex items-stretch gap-2">
            <div className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-ink-line bg-ink-soft/80 px-3 text-sm text-white/70">
              <span aria-hidden="true">🇮🇳</span>
              <span>+91</span>
            </div>
            <Input
              id="mobile"
              name="mobile"
              autoComplete="tel-national"
              inputMode="numeric"
              placeholder="98765 43210"
              maxLength={10}
              value={mobile}
              onChange={(event) => setMobile(event.target.value.replace(/\D/g, "").slice(0, 10))}
              aria-invalid={Boolean(error)}
            />
          </div>
          <p className="text-[11px] text-white/30">
            Standard SMS rates apply. OTP valid for 5 minutes.
          </p>
        </div>

        <div className="space-y-2">
          <Label>I am joining as</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {ROLES.map((option) => {
              const Icon = option.icon;
              const active = role === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRole(option.value)}
                  aria-pressed={active}
                  className={cn(
                    "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all",
                    active
                      ? "border-brand/45 bg-brand/[0.08]"
                      : "border-ink-line bg-ink-soft/40 hover:border-white/20",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-7 shrink-0 place-items-center rounded-md",
                      active ? "bg-brand/15 text-brand-soft" : "bg-white/5 text-white/40",
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-white">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-snug text-ink-muted">
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-ink-line bg-ink-soft/40 p-3.5">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[#10b981]"
          />
          <span className="text-[11px] leading-relaxed text-ink-muted">
            I agree to the LANDCHAIN terms of use, privacy policy and KYC consent.
            Investments are subject to market risk and eligibility checks.
          </span>
        </label>

        {error ? (
          <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-300">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Send OTP
          {!loading ? <ArrowRight /> : null}
        </Button>
      </form>

      <div className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-ink-line" />
        <span className="text-[10px] uppercase tracking-[0.12em] text-white/25">
          Demo credentials
        </span>
        <span className="h-px flex-1 bg-ink-line" />
      </div>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-white/30">
        Until the backend OTP service is connected, use any valid mobile number and the
        OTP <span className="font-mono text-brand-soft">123456</span>.
      </p>
    </div>
  );
}

export default function AuthPage() {
  return (
    <React.Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-ink-card" />}>
      <AuthForm />
    </React.Suspense>
  );
}
