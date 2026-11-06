"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { requestOtp, verifyOtp, DEMO_OTP } from "@/lib/api/auth";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

function OtpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuth();

  const mobile = searchParams.get("mobile") ?? "";
  const role = (searchParams.get("role") as UserRole) ?? "investor";
  const next = searchParams.get("next");
  const initialRequestId = searchParams.get("requestId") ?? "";
  const demoOtp = searchParams.get("demoOtp");

  const [requestId, setRequestId] = React.useState(initialRequestId);
  const [digits, setDigits] = React.useState<string[]>(Array(6).fill(""));
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [resendIn, setResendIn] = React.useState(30);
  const [resending, setResending] = React.useState(false);
  const inputs = React.useRef<Array<HTMLInputElement | null>>([]);

  React.useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  React.useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((value) => value - 1), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  function setDigit(index: number, value: string) {
    const clean = value.replace(/\D/g, "");
    if (!clean) {
      setDigits((current) => current.map((digit, i) => (i === index ? "" : digit)));
      return;
    }
    if (clean.length > 1) {
      const chars = clean.slice(0, 6 - index).split("");
      setDigits((current) => {
        const nextDigits = [...current];
        chars.forEach((char, offset) => {
          if (index + offset < 6) nextDigits[index + offset] = char;
        });
        return nextDigits;
      });
      const target = Math.min(index + chars.length, 5);
      inputs.current[target]?.focus();
      return;
    }
    setDigits((current) => current.map((digit, i) => (i === index ? clean : digit)));
    if (index < 5) inputs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowLeft" && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < 5) inputs.current[index + 1]?.focus();
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const text = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    setDigits(Array.from({ length: 6 }, (_, i) => text[i] ?? ""));
    inputs.current[Math.min(text.length, 6) - 1]?.focus();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const code = digits.join("");
    if (code.length !== 6) {
      setError("Enter the full 6-digit OTP.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const session = await verifyOtp({ requestId, mobile, code, role });
      signIn(session);
      const params = new URLSearchParams();
      if (next) params.set("next", next);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      router.push(`/auth/connect${suffix}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "OTP verification failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendIn > 0) return;
    setResending(true);
    setError(null);
    try {
      const result = await requestOtp(mobile);
      setRequestId(result.requestId);
      setDigits(Array(6).fill(""));
      setResendIn(30);
      inputs.current[0]?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend the OTP.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-6 grid size-11 place-items-center rounded-xl border border-ink-line bg-ink-card text-brand-soft">
        <Smartphone className="size-5" />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-soft">
        Step 1 of 3 · Mobile verification
      </p>
      <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight text-white sm:text-[32px]">
        Enter the 6-digit OTP
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        Sent to <span className="font-medium text-white">+91 {mobile}</span>.{" "}
        <Link
          href="/auth"
          className="inline-flex items-center gap-1 text-[12px] text-brand-soft hover:underline"
        >
          <ArrowLeft className="size-3" /> Change number
        </Link>
      </p>

      {demoOtp ? (
        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3.5 py-3">
          <p className="text-[11px] leading-relaxed text-amber-200/80">
            Demo mode — no SMS was sent. Use OTP{" "}
            <span className="font-mono font-semibold text-amber-200">{DEMO_OTP}</span>.
          </p>
          <button
            type="button"
            className="shrink-0 rounded-md border border-amber-400/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-200 hover:bg-amber-400/10"
            onClick={() => setDigits(DEMO_OTP.split(""))}
          >
            Autofill
          </button>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-7 space-y-5">
        <div className="flex justify-between gap-2" onPaste={handlePaste}>
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => {
                inputs.current[index] = element;
              }}
              value={digit}
              onChange={(event) => setDigit(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              aria-label={`OTP digit ${index + 1}`}
              maxLength={1}
              className={cn(
                "h-14 w-full rounded-xl border bg-ink-soft/80 text-center text-xl font-semibold text-white transition-colors focus:outline-none",
                digit
                  ? "border-brand/45 focus:border-brand"
                  : "border-ink-line focus:border-brand/60",
                error && "border-red-500/50",
              )}
            />
          ))}
        </div>

        {error ? (
          <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-300">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Verify & continue
          {!loading ? <ArrowRight /> : null}
        </Button>
      </form>

      <div className="mt-6 flex items-center justify-between text-[12px] text-ink-muted">
        <span>Didn&apos;t receive the code?</span>
        <button
          type="button"
          onClick={handleResend}
          disabled={resendIn > 0 || resending}
          className="font-medium text-brand-soft transition-opacity disabled:cursor-not-allowed disabled:text-white/30"
        >
          {resending ? "Sending…" : resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
        </button>
      </div>

      <p className="mt-8 flex items-start gap-2 text-[10px] leading-relaxed text-white/25">
        <ShieldNote />
        By continuing you authorise LANDCHAIN to verify your mobile number with the
        registered operator and store the verification reference for compliance.
      </p>
    </div>
  );
}

function ShieldNote() {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 size-3.5 shrink-0 text-brand/60" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function VerifyOtpPage() {
  return (
    <React.Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-ink-card" />}>
      <OtpForm />
    </React.Suspense>
  );
}
