import { sha256 } from "./hash.js";
import { config } from "../config.js";

/** Stateless session token (in-memory OTP challenges + revocations live here). */
export const otpChallenges = new Map();

const buckets = new Map();

/**
 * Tiny fixed-window rate limiter used by the OTP endpoints.
 * In-memory by design: the backend runs as a single process over JSON files.
 */
export function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

export function otpFingerprint(requestId, mobile, code) {
  return sha256(`${requestId}:${mobile}:${code}:${config.authSecret}`);
}

export function panFingerprint(pan) {
  return sha256(`pan:${pan}:${config.authSecret}`);
}
