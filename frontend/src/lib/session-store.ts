"use client";

import type { AuthSession } from "@/lib/types";

/**
 * Tiny external store for the auth session. Using `useSyncExternalStore` keeps
 * localStorage reads hydration-safe without setting state inside effects.
 */

const SESSION_KEY = "landchain:session";

let cached: AuthSession | null = null;
let initialized = false;
const listeners = new Set<() => void>();

function read(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

function ensureInitialized() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  cached = read();
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeToSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSessionSnapshot(): AuthSession | null {
  ensureInitialized();
  return cached;
}

export function getServerSessionSnapshot(): AuthSession | null {
  return null;
}

export function getHydratedSnapshot(): boolean {
  return true;
}

export function getServerHydratedSnapshot(): boolean {
  return false;
}

export function setSession(next: AuthSession | null) {
  cached = next;
  initialized = true;
  try {
    if (next) window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage may be unavailable — session still lives in memory */
  }
  emit();
}

export function updateSessionUser(patch: Partial<AuthSession["user"]>) {
  const current = getSessionSnapshot();
  if (!current) return;
  setSession({ ...current, user: { ...current.user, ...patch } });
}
