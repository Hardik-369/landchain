/**
 * Input validation.
 *
 * Nothing reaches the SDK or a contract call without passing through here. That
 * keeps malformed IDs out of URLs, stops accidental zero addresses and gives the
 * API layer a single, consistent validation error shape.
 */
const { ValidationError } = require("../errors");
const { toBytes32, sha256Hex } = require("./hash");

const HEDERA_ACCOUNT_ID = /^0\.0\.\d{1,10}$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEDERA_ENTITY_ID = /^0\.0\.\d{1,10}$/;
const PROPERTY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const TOKEN_SYMBOL = /^[A-Z0-9]{2,32}$/;
const TEXT = /^[\w ./&()-]{1,64}$/;

function fail(message) {
  throw new ValidationError(message);
}

function requiredString(value, field, { min = 1, max = 200 } = {}) {
  if (typeof value !== "string") fail(`${field} must be a string.`);
  const text = value.trim();
  if (text.length < min) fail(`${field} is required.`);
  if (text.length > max) fail(`${field} must be at most ${max} characters.`);
  return text;
}

/** Hedera account ID (`0.0.1234`) or an EVM address alias (`0x...`). */
function accountId(value, field = "accountId") {
  const text = requiredString(value, field, { max: 42 });
  if (!HEDERA_ACCOUNT_ID.test(text) && !EVM_ADDRESS.test(text)) {
    fail(`${field} must be a Hedera account ID (0.0.x) or an EVM address (0x + 40 hex).`);
  }
  return text;
}

function evmAddress(value, field = "evmAddress") {
  const text = requiredString(value, field, { max: 42 });
  if (!EVM_ADDRESS.test(text)) fail(`${field} must be an EVM address (0x + 40 hex).`);
  return text;
}

function entityId(value, field = "id") {
  const text = requiredString(value, field, { max: 20 });
  if (!HEDERA_ENTITY_ID.test(text)) fail(`${field} must be a Hedera entity ID (0.0.x).`);
  return text;
}

function propertyId(value) {
  const text = requiredString(value, "propertyId", { max: 64 });
  if (!PROPERTY_ID.test(text)) {
    fail("propertyId must be 1-64 characters of letters, digits, '.', '_', ':' or '-'.");
  }
  return text;
}

function propertyHash(value, field = "propertyHash") {
  return toBytes32(value, field);
}

function documentType(value = "other") {
  const text = requiredString(value, "documentType", { max: 64 });
  if (!TEXT.test(text)) fail("documentType contains unsupported characters.");
  return text;
}

function units(value, field = "units") {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(`${field} must be a positive integer.`);
  if (parsed > 4_294_967_295) fail(`${field} is too large.`);
  return parsed;
}

function positiveIntegerString(value, field) {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    fail(`${field} must be a positive safe integer.`);
  }
  return parsed;
}

function tokenSymbol(value) {
  const text = requiredString(value, "symbol", { max: 32 }).toUpperCase();
  if (!TOKEN_SYMBOL.test(text)) fail("symbol must be 2-32 uppercase letters or digits.");
  return text;
}

function tokenName(value) {
  return requiredString(value, "name", { max: 100 });
}

function eventType(value) {
  const text = requiredString(value, "eventType", { max: 64 }).toLowerCase();
  if (!/^[a-z][a-z0-9_]{1,62}$/.test(text)) {
    fail("eventType must be lower_snake_case (2-64 characters).");
  }
  return text;
}

/**
 * Payment references are anchored as bytes32. A 32-byte hex digest is used
 * as-is; any other reference is hashed so the same input always maps to the same
 * on-chain value.
 */
function paymentRef(value, field = "paymentRef") {
  if (value === undefined || value === null || value === "") return `0x${"0".repeat(64)}`;
  const text = requiredString(value, field, { max: 128 });
  const hex = text.replace(/^0x/i, "");
  if (/^[0-9a-fA-F]{64}$/.test(hex) && !/^0{64}$/.test(hex)) return `0x${hex.toLowerCase()}`;
  return `0x${sha256Hex(text)}`;
}

/** HCS messages are capped at 1024 bytes by the network. */
function hcsPayloadSize(payload, maxBytes = 1024) {
  const size = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (size > maxBytes) {
    fail(`HCS message is ${size} bytes; the limit is ${maxBytes} bytes. Reduce the payload.`);
  }
  return payload;
}

module.exports = {
  requiredString,
  accountId,
  evmAddress,
  entityId,
  propertyId,
  propertyHash,
  documentType,
  units,
  positiveIntegerString,
  tokenSymbol,
  tokenName,
  eventType,
  paymentRef,
  hcsPayloadSize,
};
