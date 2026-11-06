import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrCompact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 2,
});

/** ₹1,25,00,000 — full Indian grouping. */
export function formatCurrency(value: number) {
  return inr.format(Number.isFinite(value) ? value : 0);
}

/** ₹1.25 Cr / ₹45 L — compact display for cards and charts. */
export function formatCompactCurrency(value: number) {
  if (!Number.isFinite(value)) return "₹0";
  if (value >= 1_00_00_000) {
    const cr = value / 1_00_00_000;
    return `₹${cr.toFixed(cr >= 10 ? 1 : 2)} Cr`;
  }
  if (value >= 1_00_000) {
    const lakh = value / 1_00_000;
    return `₹${lakh.toFixed(lakh >= 10 ? 1 : 2)} L`;
  }
  return inrCompact.format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

export function formatArea(sqft: number) {
  return `${formatNumber(sqft)} sq.ft`;
}

export function formatPercent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

export function formatDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function truncateMiddle(value: string, head = 8, tail = 6) {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
