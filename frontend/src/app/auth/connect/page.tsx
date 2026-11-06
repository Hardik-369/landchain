"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, CreditCard, Wallet, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth-provider";
import { connectWallet, verifyPan } from "@/lib/api/auth";
import { ROLE_HOME } from "@/lib/constants";
import { cn, truncateMiddle } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

const DEMO_WALLET = "0x4F9c2B7a1D6e83C05A4b9F2e8C1d7B3a6E0f5D24";

function ConnectForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, updateUser } = useAuth();
  const next = searchParams.get("next");
  const role = user?.role ?? (searchParams.get("role") as UserRole) ?? "investor";

  const [step, setStep] = React.useState<"wallet" | "pan" | "done">("wallet");
  const [wallet, setWallet] = React.useState(user?.walletAddress ?? "");
  const [walletError, setWalletError] = React.useState<string | null>(null);
  const [walletLoading, setWalletLoading] = React.useState(false);

  const [pan, setPan] = React.useState("");
  const [panError, setPanError] = React.useState<string | null>(null);
  const [panLoading, setPanLoading] = React.useState(false);
  const [panMasked, setPanMasked] = React.useState(user?.panMasked ?? "");

  const destination = next ?? ROLE_HOME[role];

  async function handleWallet(event: React.FormEvent) {
    event.preventDefault();
    setWalletError(null);
    setWalletLoading(true);
    try {
      const result = await connectWallet(wallet);
      updateUser({ walletAddress: result.address });
      setWallet(result.address);
      setStep("pan");
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : "Unable to link this wallet.");
    } finally {
      setWalletLoading(false);
    }
  }

  async function handlePan(event: React.FormEvent) {
    event.preventDefault();
    setPanError(null);
    setPanLoading(true);
    try {
      const result = await verifyPan(pan);
      updateUser({ panMasked: result.panMasked, kycStatus: result.status });
      setPanMasked(result.panMasked);
      setStep("done");
    } catch (err) {
      setPanError(err instanceof Error ? err.message : "PAN verification failed.");
    } finally {
      setPanLoading(false);
    }
  }

  function handleMetaMask() {
    const ethereum = (
      window as unknown as {
        ethereum?: { request: (args: { method: string }) => Promise<string[]> };
      }
    ).ethereum;

    if (!ethereum) {
      setWalletError("No browser wallet detected. Paste an address or use the demo wallet.");
      return;
    }

    setWalletError(null);
    setWalletLoading(true);
    ethereum
      .request({ method: "eth_requestAccounts" })
      .then((accounts) => {
        if (accounts[0]) setWallet(accounts[0]);
        else setWalletError("Wallet returned no account.");
      })
      .catch(() => setWalletError("Wallet connection was rejected."))
      .finally(() => setWalletLoading(false));
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-7 flex items-center gap-3">
        {["Mobile", "Wallet", "PAN"].map((label, index) => {
          const currentIndex = step === "wallet" ? 1 : step === "pan" ? 2 : 3;
          const complete = index + 1 < currentIndex || step === "done";
          const active = index + 1 === currentIndex && step !== "done";
          return (
            <React.Fragment key={label}>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full border text-[10px] font-semibold",
                    complete && "border-brand/40 bg-brand text-ink",
                    active && "border-brand text-brand-soft",
                    !complete && !active && "border-ink-line text-white/30",
                  )}
                >
                  {complete ? <Check className="size-3" /> : index + 1}
                </span>
                <span
                  className={cn(
                    "text-[11px] font-medium",
                    active ? "text-white" : "text-ink-muted",
                  )}
                >
                  {label}
                </span>
              </div>
              {index < 2 ? <span className="h-px flex-1 bg-ink-line" /> : null}
            </React.Fragment>
          );
        })}
      </div>

      {step === "wallet" ? (
        <>
          <div className="mb-6 grid size-11 place-items-center rounded-xl border border-ink-line bg-ink-card text-brand-soft">
            <Wallet className="size-5" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-soft">
            Step 2 of 3 · Wallet
          </p>
          <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight text-white sm:text-[32px]">
            Connect your ownership wallet
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Your wallet holds fractional ownership units. LANDCHAIN never takes custody
            of your keys.
          </p>

          <form onSubmit={handleWallet} className="mt-7 space-y-4">
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-between"
              size="lg"
              onClick={handleMetaMask}
              loading={walletLoading}
            >
              <span className="flex items-center gap-2.5">
                <span className="grid size-6 place-items-center rounded-md bg-white/10">
                  <Wallet className="size-3.5" />
                </span>
                Connect browser wallet
              </span>
              <ArrowRight />
            </Button>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-ink-line" />
              <span className="text-[10px] uppercase tracking-[0.12em] text-white/25">
                or paste address
              </span>
              <span className="h-px flex-1 bg-ink-line" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="wallet">Wallet address</Label>
              <Input
                id="wallet"
                placeholder="0x…"
                autoComplete="off"
                spellCheck={false}
                value={wallet}
                onChange={(event) => setWallet(event.target.value)}
                className="font-mono text-[12px]"
              />
              <button
                type="button"
                onClick={() => setWallet(DEMO_WALLET)}
                className="text-[11px] font-medium text-brand-soft hover:underline"
              >
                Use demo wallet
              </button>
            </div>

            {walletError ? (
              <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-300">
                {walletError}
              </p>
            ) : null}

            <Button type="submit" size="lg" className="w-full">
              Link wallet
              <ArrowRight />
            </Button>
          </form>
        </>
      ) : null}

      {step === "pan" ? (
        <>
          <div className="mb-6 grid size-11 place-items-center rounded-xl border border-ink-line bg-ink-card text-brand-soft">
            <CreditCard className="size-5" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-soft">
            Step 3 of 3 · Identity
          </p>
          <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight text-white sm:text-[32px]">
            Verify your PAN
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Required for KYC and investment limit checks. Details are validated against
            the income tax database in sandbox mode.
          </p>

          <div className="mt-5 flex items-center gap-2 rounded-lg border border-ink-line bg-ink-soft/50 px-3 py-2 text-[11px] text-ink-muted">
            <Wallet className="size-3.5 text-brand" />
            Wallet linked:{" "}
            <span className="font-mono text-white/80">
              {wallet ? truncateMiddle(wallet, 8, 6) : "—"}
            </span>
          </div>

          <form onSubmit={handlePan} className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pan">Permanent Account Number</Label>
              <Input
                id="pan"
                placeholder="ABCDE1234F"
                maxLength={10}
                autoComplete="off"
                spellCheck={false}
                value={pan}
                onChange={(event) => setPan(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                className="font-mono uppercase tracking-[0.18em]"
              />
              <p className="text-[11px] text-white/30">
                Format: 5 letters, 4 digits, 1 letter. Demo PAN: ABCDE1234F.
              </p>
            </div>

            {panError ? (
              <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-[12px] text-red-300">
                {panError}
              </p>
            ) : null}

            <Button type="submit" size="lg" className="w-full" loading={panLoading}>
              Verify PAN
              {!panLoading ? <ShieldCheck /> : null}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => router.push(destination)}
            className="mt-4 w-full text-center text-[11px] text-white/30 hover:text-white/60"
          >
            Skip for now — PAN required before investing
          </button>
        </>
      ) : null}

      {step === "done" ? (
        <div className="animate-scale-in text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand/15">
            <Check className="size-8 text-brand" />
          </div>
          <h1 className="mt-6 text-[26px] font-semibold tracking-tight text-white">
            You&apos;re verified
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
            Mobile, wallet and PAN verification are complete. Your ownership units will
            be issued to{" "}
            <span className="font-mono text-white/80">{truncateMiddle(wallet, 6, 4)}</span>.
          </p>

          <dl className="mt-6 space-y-2 rounded-xl border border-ink-line bg-ink-card p-4 text-left text-[12px]">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Mobile</dt>
              <dd className="text-white">{user?.mobile ?? "Verified"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Wallet</dt>
              <dd className="font-mono text-white">{truncateMiddle(wallet, 10, 6)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">PAN</dt>
              <dd className="font-mono text-white">{panMasked || user?.panMasked || "Verified"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">KYC status</dt>
              <dd className="inline-flex items-center gap-1.5 text-brand-soft">
                <span className="size-1.5 rounded-full bg-brand" /> Verified
              </dd>
            </div>
          </dl>

          <Button size="lg" className="mt-7 w-full" onClick={() => router.push(destination)}>
            {role === "admin"
              ? "Enter admin console"
              : role === "seller"
                ? "Open seller dashboard"
                : role === "buyer"
                  ? "Browse properties"
                  : "Open my portfolio"}
            <ArrowRight />
          </Button>
        </div>
      ) : null}

      <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-[10px] text-white/25">
        <ShieldCheck className="size-3" />
        Encrypted at rest · Never shared without consent
      </p>
    </div>
  );
}

export default function ConnectWalletPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex h-80 items-center justify-center rounded-2xl border border-ink-line bg-ink-card">
          <Loader2 className="size-5 animate-spin text-brand" />
        </div>
      }
    >
      <ConnectForm />
    </React.Suspense>
  );
}
