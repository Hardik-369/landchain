const test = require("node:test");
const assert = require("node:assert/strict");
const v = require("../../src/utils/validation");
const { ValidationError } = require("../../src/errors");
const { sha256Hex } = require("../../src/utils/hash");

test("accepts Hedera account IDs and EVM aliases", () => {
  assert.equal(v.accountId("0.0.1234"), "0.0.1234");
  assert.equal(v.accountId("0x" + "a".repeat(40)), "0x" + "a".repeat(40));
});

test("rejects malformed account identifiers", () => {
  assert.throws(() => v.accountId("1234"), ValidationError);
  assert.throws(() => v.accountId("0x1234"), ValidationError);
  assert.throws(() => v.accountId(""), ValidationError);
});

test("property IDs reject unsafe characters", () => {
  assert.equal(v.propertyId("LAND-2026-001"), "LAND-2026-001");
  assert.throws(() => v.propertyId("LAND 2026/001"), ValidationError);
  assert.throws(() => v.propertyId("-leading"), ValidationError);
  assert.throws(() => v.propertyId("a".repeat(65)), ValidationError);
});

test("units must be positive whole numbers", () => {
  assert.equal(v.units(10), 10);
  assert.equal(v.units("10"), 10);
  assert.throws(() => v.units(0), ValidationError);
  assert.throws(() => v.units(-1), ValidationError);
  assert.throws(() => v.units(1.5), ValidationError);
  assert.throws(() => v.units("abc"), ValidationError);
});

test("positiveIntegerString accepts numeric strings", () => {
  assert.equal(v.positiveIntegerString("250000", "amount"), 250000);
  assert.throws(() => v.positiveIntegerString("0", "amount"), ValidationError);
});

test("token symbols are normalised and constrained", () => {
  assert.equal(v.tokenSymbol("land900"), "LAND900");
  assert.throws(() => v.tokenSymbol("L"), ValidationError);
  assert.throws(() => v.tokenSymbol("LAND-900"), ValidationError);
});

test("event types are lower snake case", () => {
  assert.equal(v.eventType("Document_Verified"), "document_verified");
  assert.throws(() => v.eventType("not a type!"), ValidationError);
});

test("payment references: 32-byte hex is used as-is, anything else is hashed", () => {
  const hex = "ab".repeat(32);
  assert.equal(v.paymentRef(hex), `0x${hex}`);
  assert.equal(v.paymentRef(`0x${hex}`), `0x${hex}`);
  assert.equal(v.paymentRef("UPI-REF-123"), `0x${sha256Hex("UPI-REF-123")}`);
  assert.equal(v.paymentRef(""), `0x${"0".repeat(64)}`);
});

test("HCS payloads over 1024 bytes are rejected", () => {
  assert.deepEqual(v.hcsPayloadSize({ ok: true }), { ok: true });
  assert.throws(
    () => v.hcsPayloadSize({ blob: "x".repeat(1100) }),
    /limit is 1024 bytes/,
  );
});
