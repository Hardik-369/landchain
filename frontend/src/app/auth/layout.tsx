import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Fingerprint, Building2 } from "lucide-react";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Register with your mobile number, verify via OTP, connect a wallet and complete PAN verification to invest on LANDCHAIN.",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[0.95fr_1.05fr]">
      <aside className="relative hidden overflow-hidden border-r border-ink-line bg-ink-soft p-10 lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0 grid-overlay" />
        <div className="pointer-events-none absolute -left-20 top-1/3 size-80 rounded-full bg-brand/10 blur-[110px]" />
        <div className="relative">
          <Brand />
        </div>

        <div className="relative mt-auto max-w-md pb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-soft">
            Investor onboarding
          </p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-white">
            Three checks between you and registered property ownership.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            Mobile verification, wallet linking and PAN validation are required under
            the platform&apos;s KYC and prevention of money laundering policy.
          </p>

          <ul className="mt-8 space-y-4">
            {[
              {
                icon: ShieldCheck,
                title: "Registry-backed assets",
                description: "Every listing carries a verified title hash.",
              },
              {
                icon: Fingerprint,
                title: "One identity, one wallet",
                description: "Your holdings reconcile to a single verified address.",
              },
              {
                icon: Building2,
                title: "Regulated structures",
                description: "SEBI and RERA-compliant fractional ownership.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title} className="flex gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-ink-line bg-ink-card text-brand-soft">
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <p className="text-[13px] font-medium text-white">{item.title}</p>
                    <p className="mt-0.5 text-[12px] text-ink-muted">{item.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="relative mt-8 border-t border-ink-line pt-5 text-[11px] text-white/30">
          LANDCHAIN Technologies Pvt. Ltd. · Mumbai
        </div>
      </aside>

      <main className="relative flex flex-col bg-ink">
        <div className="flex items-center justify-between px-5 py-5 sm:px-8">
          <div className="lg:hidden">
            <Brand />
          </div>
          <Link
            href="/"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] text-ink-muted transition-colors hover:text-white"
          >
            <ArrowLeft className="size-3.5" /> Back to site
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-16 pt-4 sm:px-8">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </main>
    </div>
  );
}
