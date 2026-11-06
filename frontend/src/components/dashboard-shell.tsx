"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  PlusCircle,
  ShieldCheck,
  Wallet,
  Store,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Users,
  BadgeCheck,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth-provider";
import { cn, initials, truncateMiddle } from "@/lib/utils";
import type { UserRole } from "@/lib/types";
import { ROLE_HOME } from "@/lib/constants";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  buyer: [
    { label: "Marketplace", href: "/buyer", icon: Store },
    { label: "Property registry", href: "/registry", icon: ShieldCheck },
    { label: "Resale market", href: "/resale", icon: Building2 },
  ],
  seller: [
    { label: "Seller overview", href: "/seller", icon: LayoutDashboard },
    { label: "List a property", href: "/seller/new", icon: PlusCircle },
    { label: "Property registry", href: "/registry", icon: ShieldCheck },
  ],
  investor: [
    { label: "Portfolio", href: "/investor", icon: LayoutDashboard },
    { label: "Marketplace", href: "/buyer", icon: Store },
    { label: "Resale market", href: "/resale", icon: Building2 },
    { label: "Property registry", href: "/registry", icon: ShieldCheck },
  ],
  admin: [
    { label: "Admin overview", href: "/admin", icon: LayoutDashboard },
    { label: "Verification queue", href: "/admin?tab=verification", icon: BadgeCheck },
    { label: "User management", href: "/admin?tab=users", icon: Users },
    { label: "Property registry", href: "/registry", icon: ShieldCheck },
  ],
};

const ROLE_LABELS: Record<UserRole, string> = {
  buyer: "Buyer workspace",
  seller: "Seller workspace",
  investor: "Investor workspace",
  admin: "Admin console",
};

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const items = user ? NAV_BY_ROLE[user.role] : [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[72px] items-center px-6">
        <Brand />
      </div>

      <div className="px-4 pb-4">
        <div className="rounded-xl border border-ink-line bg-ink-soft/70 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            {user ? ROLE_LABELS[user.role] : "Guest workspace"}
          </p>
          <p className="mt-1 truncate text-sm font-medium text-white">
            {user?.name ?? "Not signed in"}
          </p>
          {user ? (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-brand-soft">
              <span className="size-1.5 rounded-full bg-brand" />
              KYC {user.kycStatus === "verified" ? "verified" : user.kycStatus.replace("_", " ")}
            </div>
          ) : (
            <Link
              href="/auth"
              onClick={onNavigate}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-soft"
            >
              Sign in <ArrowUpRight className="size-3" />
            </Link>
          )}
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4 scrollbar-thin">
        {items.map((item) => {
          const active =
            pathname === item.href.split("?")[0] &&
            (!item.href.includes("?") || item.label.startsWith("Admin"));
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors",
                active
                  ? "bg-brand/[0.12] text-white"
                  : "text-ink-muted hover:bg-white/[0.05] hover:text-white",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  active ? "text-brand" : "text-white/40 group-hover:text-white/70",
                )}
              />
              <span className="truncate">{item.label}</span>
              {active ? (
                <ChevronRight className="ml-auto size-3.5 text-brand/70" />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-ink-line p-4">
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-ink-line bg-ink-soft/60 px-3 py-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-brand/15 text-[11px] font-bold text-brand-soft">
            {user ? initials(user.name) : "—"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium text-white">
              {user?.name ?? "Guest"}
            </p>
            <p className="truncate text-[10px] text-ink-muted">
              {user?.walletAddress ? truncateMiddle(user.walletAddress, 6, 4) : "Wallet not linked"}
            </p>
          </div>
        </div>
        {user ? (
          <div className="flex gap-2">
            <Link href={ROLE_HOME[user.role]} className="flex-1" onClick={onNavigate}>
              <Button variant="secondary" size="sm" className="w-full">
                {user.role === "admin" ? "Console" : "Dashboard"}
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={() => {
                signOut();
                router.push("/");
              }}
            >
              <LogOut />
            </Button>
          </div>
        ) : (
          <Link href="/auth" onClick={onNavigate}>
            <Button className="w-full" size="sm">
              Sign in
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

export function DashboardShell({
  children,
  requireAuth = false,
  roles,
}: {
  children: React.ReactNode;
  requireAuth?: boolean;
  roles?: UserRole[];
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (!requireAuth || loading || user) return;
    const target = window.location.pathname + window.location.search;
    router.replace(`/auth?next=${encodeURIComponent(target || pathname)}`);
  }, [requireAuth, loading, user, router, pathname]);

  if (requireAuth && loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink">
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <span className="size-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          Verifying your session…
        </div>
      </div>
    );
  }

  if (requireAuth && !user) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink px-6 text-center">
        <div>
          <p className="text-sm text-ink-muted">Redirecting to sign in…</p>
          <Link href="/auth" className="mt-3 inline-block text-sm text-brand-soft underline">
            Open sign in
          </Link>
        </div>
      </div>
    );
  }

  const roleBlocked = Boolean(roles && user && !roles.includes(user.role));

  return (
    <div className="min-h-dvh bg-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-ink-line bg-ink-soft/60 lg:block">
        <SidebarContent />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-ink-line bg-ink-soft">
            <button
              type="button"
              className="absolute right-3 top-5 z-10 grid size-9 place-items-center rounded-lg border border-ink-line text-white"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X className="size-4" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b border-ink-line bg-ink/85 px-4 backdrop-blur-xl sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="grid size-10 place-items-center rounded-xl border border-ink-line text-white lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </button>

          <div className="hidden items-center gap-2 text-xs text-ink-muted sm:flex">
            <span className="rounded-md border border-ink-line bg-ink-soft px-2 py-1 font-mono text-[10px] uppercase tracking-wider">
              Hedera mainnet
            </span>
            <span className="hidden md:inline">Registry synced 2 min ago</span>
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            <Link href="/buyer" className="hidden sm:block">
              <Button variant="ghost" size="sm">
                Marketplace
                <ArrowUpRight />
              </Button>
            </Link>
            {user ? (
              <div className="flex items-center gap-2 rounded-xl border border-ink-line bg-ink-soft/80 px-2.5 py-1.5">
                <Wallet className="size-4 text-brand" />
                <span className="font-mono text-[11px] text-white/80">
                  {user.walletAddress ? truncateMiddle(user.walletAddress, 6, 4) : "Wallet pending"}
                </span>
                <Badge variant="brand" className="hidden sm:inline-flex">
                  {user.role}
                </Badge>
              </div>
            ) : (
              <Link href="/auth">
                <Button size="sm">Sign in</Button>
              </Link>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
          {roleBlocked ? (
            <div className="mx-auto mt-12 max-w-md rounded-2xl border border-ink-line bg-ink-card p-8 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-xl bg-amber-400/10 text-amber-300">
                <ShieldCheck className="size-6" />
              </span>
              <h1 className="mt-4 text-lg font-semibold text-white">
                {roles?.[0] === "admin" ? "Admin access required" : "Different role required"}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                You are signed in as a {user?.role}. Switch to the
                {" "}
                {(roles ?? []).join(" or ")} workspace from the sign-in page to
                continue.
              </p>
              <div className="mt-6 flex justify-center gap-2">
                <Link href={ROLE_HOME[user!.role]}>
                  <Button variant="secondary" size="sm">
                    My dashboard
                  </Button>
                </Link>
                <Link href="/auth">
                  <Button size="sm">Switch account</Button>
                </Link>
              </div>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
