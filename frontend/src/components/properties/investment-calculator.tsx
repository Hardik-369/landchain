"use client";

import * as React from "react";
import { Calculator, Loader2, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { quoteInvestment, type InvestmentQuote } from "@/lib/api/portfolio";
import { clsx } from "clsx";
import { formatCompactCurrency, formatCurrency, formatPercent } from "@/lib/utils";
import type { Property } from "@/lib/types";

const QUICK_AMOUNTS = [1, 2, 5, 10];

export function InvestmentCalculator({
  property,
  onInvest,
}: {
  property: Property;
  onInvest?: (units: number) => void;
}) {
  const minUnits = Math.max(1, Math.ceil(property.minInvestment / property.unitPrice));
  const maxUnits = Math.max(0, property.totalUnits - property.unitsSold);
  const [amount, setAmount] = React.useState(String(property.minInvestment));
  const [quote, setQuote] = React.useState<InvestmentQuote | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const numericAmount = Number(amount.replace(/[^0-9]/g, "")) || 0;
  const units = Math.floor(numericAmount / property.unitPrice);

  React.useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setPending(true);
      setError(null);
      quoteInvestment(property.id, units)
        .then((result) => {
          if (active) setQuote(result);
        })
        .catch((err: unknown) => {
          if (active) {
            setError(err instanceof Error ? err.message : "Unable to calculate returns.");
          }
        })
        .finally(() => {
          if (active) setPending(false);
        });
    }, 260);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [property.id, units]);

  const belowMinimum = numericAmount > 0 && numericAmount < property.minInvestment;
  const aboveAvailability = units > maxUnits;
  const canInvest = units >= minUnits && !belowMinimum && !aboveAvailability;

  return (
    <div className="rounded-2xl border border-ink-line bg-ink-card/90 p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-lg bg-brand/10 text-brand-soft">
          <Calculator className="size-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-white">Investment calculator</h3>
          <p className="text-[11px] text-ink-muted">
            {formatCurrency(property.unitPrice)} per unit · min{" "}
            {formatCurrency(property.minInvestment)}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <Label htmlFor="investment-amount">Investment amount (₹)</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-white/40">
            ₹
          </span>
          <Input
            id="investment-amount"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))}
            className="pl-7 text-base font-semibold"
            aria-describedby="investment-hint"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {QUICK_AMOUNTS.map((lakh) => {
            const value = lakh * 1_00_000;
            return (
              <button
                key={lakh}
                type="button"
                onClick={() => setAmount(String(value))}
                className={clsx(
                  "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                  numericAmount === value
                    ? "border-brand/40 bg-brand/10 text-brand-soft"
                    : "border-ink-line text-ink-muted hover:border-white/20 hover:text-white",
                )}
              >
                ₹{lakh}L
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setAmount(String(property.minInvestment))}
            className="rounded-md border border-ink-line px-2 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:border-white/20 hover:text-white"
          >
            Minimum
          </button>
        </div>
      </div>

      <dl className="mt-5 space-y-0 divide-y divide-ink-line/70 rounded-xl border border-ink-line/70 bg-ink-soft/40 px-4 py-1 text-sm">
        <div className="flex items-center justify-between py-2.5">
          <dt className="text-ink-muted">Units</dt>
          <dd className="font-medium text-white">
            {pending && !quote ? "…" : units.toLocaleString("en-IN")}
          </dd>
        </div>
        <div className="flex items-center justify-between py-2.5">
          <dt className="text-ink-muted">Ownership</dt>
          <dd className="font-medium text-white">
            {quote ? formatPercent(quote.ownershipPercent, 2) : "—"}
          </dd>
        </div>
        <div className="flex items-center justify-between py-2.5">
          <dt className="flex items-center gap-1.5 text-ink-muted">
            Rental income <span className="text-[10px]">/ yr</span>
          </dt>
          <dd className="font-medium text-brand-soft">
            {quote ? formatCompactCurrency(quote.annualRentalIncome) : "—"}
          </dd>
        </div>
        <div className="flex items-center justify-between py-2.5">
          <dt className="flex items-center gap-1.5 text-ink-muted">
            <TrendingUp className="size-3.5" /> Value in 5 years
          </dt>
          <dd className="font-medium text-white">
            {quote ? formatCompactCurrency(quote.projectedValue5Years) : "—"}
          </dd>
        </div>
      </dl>

      {belowMinimum ? (
        <p className="mt-3 text-[11px] text-amber-300">
          Minimum investment for this property is {formatCurrency(property.minInvestment)}.
        </p>
      ) : null}
      {aboveAvailability ? (
        <p className="mt-3 text-[11px] text-amber-300">
          Only {maxUnits.toLocaleString("en-IN")} units remain available.
        </p>
      ) : null}
      {error ? <p className="mt-3 text-[11px] text-red-300">{error}</p> : null}

      <Button
        className="mt-4 w-full"
        disabled={!canInvest || pending}
        onClick={() => onInvest?.(units)}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Wallet />}
        {canInvest ? `Invest ${formatCompactCurrency(numericAmount)}` : "Enter an amount"}
      </Button>
      <p className="mt-2.5 text-center text-[10px] leading-relaxed text-white/30">
        Projections use the property&apos;s target yield and appreciation. They are not a
        guarantee of returns.
      </p>
    </div>
  );
}
