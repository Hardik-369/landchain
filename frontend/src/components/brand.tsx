import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand-soft via-brand to-brand-deep shadow-[0_8px_20px_-8px_rgba(16,185,129,0.9)]",
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="size-5 text-ink" fill="none">
        <path
          d="M7 18V9.5L12 6l5 3.5V18"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10 18v-4.2h4V18"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.5 20.5h15"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function Brand({
  href = "/",
  className,
  compact = false,
}: {
  href?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn("group inline-flex items-center gap-2.5", className)}
      aria-label="LANDCHAIN home"
    >
      <BrandMark />
      {!compact ? (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-bold tracking-[0.16em] text-white">
            LANDCHAIN
          </span>
          <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.22em] text-ink-muted">
            Property · On-chain
          </span>
        </span>
      ) : null}
    </Link>
  );
}
