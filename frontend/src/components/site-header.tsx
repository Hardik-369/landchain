"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { PUBLIC_NAV, ROLE_HOME } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const { user } = useAuth();

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b transition-colors duration-300",
        scrolled
          ? "border-ink-line/80 bg-ink/85 backdrop-blur-xl"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
        <Brand />

        <nav className="hidden items-center gap-1 lg:flex">
          {PUBLIC_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-ink-muted transition-colors hover:bg-white/[0.05] hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2.5 lg:flex">
          {user ? (
            <Link href={ROLE_HOME[user.role]}>
              <Button size="sm">
                Dashboard
                <ArrowUpRight />
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/auth">
                <Button variant="ghost" size="sm">
                  Sign in
                </Button>
              </Link>
              <Link href="/auth">
                <Button size="sm">Start investing</Button>
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="grid size-10 place-items-center rounded-xl border border-ink-line text-white lg:hidden"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-ink-line bg-ink/95 px-5 pb-6 pt-3 backdrop-blur-xl lg:hidden">
          <nav className="flex flex-col">
            {PUBLIC_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="border-b border-ink-line/60 py-3 text-sm text-white/80"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-5 flex flex-col gap-2">
            {user ? (
              <Link href={ROLE_HOME[user.role]} onClick={() => setOpen(false)}>
                <Button className="w-full">Go to dashboard</Button>
              </Link>
            ) : (
              <>
                <Link href="/auth" onClick={() => setOpen(false)}>
                  <Button className="w-full">Start investing</Button>
                </Link>
                <Link href="/auth" onClick={() => setOpen(false)}>
                  <Button variant="secondary" className="w-full">
                    Sign in
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
