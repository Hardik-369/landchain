"use client";

/**
 * Thin localStorage-backed persistence used only while the shared backend
 * APIs are unavailable. Every mutation goes through the service layer, never
 * directly from a component.
 */

const PREFIX = "landchain:mock:";

export function readMock<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${key}`);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeMock<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
  } catch {
    /* storage may be unavailable in private mode — mock data still works in memory */
  }
}

export function clearMock(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`${PREFIX}${key}`);
}
