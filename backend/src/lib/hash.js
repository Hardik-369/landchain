import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Deterministic JSON serialisation with sorted object keys. */
export function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys
    .filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(",")}}`;
}

/** SHA-256 hex digest of a string or a canonicalised value. */
export function sha256(value) {
  const input = typeof value === "string" ? value : canonicalize(value);
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** HMAC-SHA256 base64url digest. */
export function hmac(value, secret) {
  return createHmac("sha256", secret).update(value, "utf8").digest("base64url");
}

/** Constant-time comparison for hashes and tokens. */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** 0x-prefixed pseudo transaction hash derived from the payload. */
export function pseudoTxHash(payload, length = 64) {
  return `0x${sha256(payload).slice(0, length)}`;
}

/** Short readable digest used for ids and fingerprints. */
export function shortHash(value, length = 8) {
  return sha256(value).slice(0, length);
}
