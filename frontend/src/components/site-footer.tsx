import Link from "next/link";
import { Brand } from "@/components/brand";
import { SITE } from "@/lib/constants";

const COLUMNS = [
  {
    title: "Platform",
    links: [
      { label: "Marketplace", href: "/buyer" },
      { label: "Property registry", href: "/registry" },
      { label: "Resale marketplace", href: "/resale" },
      { label: "How it works", href: "/#how-it-works" },
    ],
  },
  {
    title: "Participants",
    links: [
      { label: "Buyer dashboard", href: "/buyer" },
      { label: "Investor dashboard", href: "/investor" },
      { label: "Seller dashboard", href: "/seller" },
      { label: "Admin console", href: "/admin" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-ink-line bg-ink-soft">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <Brand />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-ink-muted">
              {SITE.description}
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/[0.07] px-3 py-1.5 text-[11px] font-medium text-brand-soft">
              <span className="size-1.5 animate-pulse rounded-full bg-brand" />
              Registry live on Hedera mainnet
            </div>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                {column.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-ink-muted transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
              Contact
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm text-ink-muted">
              <li>{SITE.email}</li>
              <li>{SITE.phone}</li>
              <li className="max-w-[15rem] leading-relaxed">{SITE.address}</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-ink-line pt-6 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 LANDCHAIN Technologies Pvt. Ltd. All rights reserved.</p>
          <p className="max-w-2xl leading-relaxed">
            Fractional ownership is offered to verified investors under SEBI and
            RERA-compliant structures. Past performance is not indicative of future
            returns.
          </p>
        </div>
      </div>
    </footer>
  );
}
