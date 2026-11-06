/**
 * Centralised API client.
 *
 * Every network call in the app goes through this module. When
 * NEXT_PUBLIC_API_URL is set the request hits the shared backend contracts;
 * otherwise (or if the backend is unreachable) the service layer falls back to
 * deterministic mock responses so the UI stays fully navigable.
 */

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

const MOCK_ENABLED = process.env.NEXT_PUBLIC_USE_MOCK_API !== "false";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function hasBackend(): boolean {
  return Boolean(API_BASE_URL);
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiError("API base URL is not configured", 0);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;
      try {
        const body = (await response.json()) as { message?: string };
        if (body?.message) message = body.message;
      } catch {
        /* non-JSON error body */
      }
      throw new ApiError(message, response.status);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

/** Try the real contract, fall back to mock data when unavailable. */
export async function withMock<T>(
  path: string,
  init: RequestInit,
  fallback: () => T | Promise<T>,
  latency = 260,
): Promise<T> {
  if (!MOCK_ENABLED || !API_BASE_URL) {
    await delay(latency);
    return fallback();
  }

  try {
    return await apiRequest<T>(path, init);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[landchain] ${path} unavailable — serving mock response.`, error);
    }
    await delay(latency);
    return fallback();
  }
}

export function mockId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

/** Fixed clock for deterministic mock portfolio maths. */
export const DEMO_NOW = new Date("2026-11-06T10:00:00.000Z");
