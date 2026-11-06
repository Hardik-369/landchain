/**
 * Hashing and bytes32 helpers.
 *
 * The digest algorithm and canonical JSON serialisation match
 * backend/src/lib/hash.js exactly, so a hash produced by Contributor 2's hash
 * registry can be anchored on-chain and re-verified byte for byte.
 */
const { createHash } = require("node:crypto");
const { ValidationError } = require("../errors");

/** Deterministic JSON serialisation with sorted object keys. */
function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys
    .filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(",")}}`;
}

/** SHA-256 hex digest of a string or a canonicalised value (64 chars, no 0x). */
function sha256Hex(value) {
  const input =
    typeof value === "string"
      ? value
      : Buffer.isBuffer(value)
        ? value
        : canonicalize(value);
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Convert a SHA-256 digest to the bytes32 value the contracts expect.
 * Accepts `0x`-prefixed hex, bare hex, a Buffer, or a Uint8Array.
 */
function toBytes32(value, field = "hash") {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const buffer = Buffer.from(value);
    if (buffer.length !== 32) {
      throw new ValidationError(`${field} must be 32 bytes, received ${buffer.length}.`);
    }
    return `0x${buffer.toString("hex")}`;
  }
  const text = String(value ?? "").trim();
  const hex = text.startsWith("0x") || text.startsWith("0X") ? text.slice(2) : text;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new ValidationError(
      `${field} must be a 32-byte hex digest (64 hex characters, optional 0x prefix).`,
    );
  }
  if (/^0{64}$/.test(hex)) {
    throw new ValidationError(`${field} cannot be the zero hash.`);
  }
  return `0x${hex.toLowerCase()}`;
}

/** bytes32 back to the bare 64-char hex form used by the backend. */
function fromBytes32(value) {
  return String(value).replace(/^0x/i, "").toLowerCase();
}

/** SHA-256 of a document buffer, ready to anchor. */
function hashDocument(content) {
  return sha256Hex(Buffer.isBuffer(content) ? content : Buffer.from(String(content)));
}

module.exports = { canonicalize, sha256Hex, toBytes32, fromBytes32, hashDocument };
