const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  canonicalize,
  sha256Hex,
  toBytes32,
  fromBytes32,
  hashDocument,
} = require("../../src/utils/hash");
const { ValidationError } = require("../../src/errors");

test("canonicalize sorts object keys deterministically", () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalize({ a: 2, b: 1 }), '{"a":2,"b":1}');
  assert.equal(canonicalize([{ z: 1, y: 2 }]), '[{"y":2,"z":1}]');
  assert.equal(canonicalize(null), "null");
  assert.equal(canonicalize("x"), '"x"');
});

test("sha256Hex matches the backend hash registry formula", () => {
  const payload = { id: "LAND-2026-001", totalUnits: 2500, unitPrice: 50000 };
  const expected = createHash("sha256")
    .update('{"id":"LAND-2026-001","totalUnits":2500,"unitPrice":50000}', "utf8")
    .digest("hex");
  assert.equal(sha256Hex(payload), expected);
  assert.equal(sha256Hex("landchain"), createHash("sha256").update("landchain").digest("hex"));
});

test("toBytes32 accepts 64-char hex with or without the 0x prefix", () => {
  const bare = "ab".repeat(32);
  assert.equal(toBytes32(bare), `0x${bare}`);
  assert.equal(toBytes32(`0x${bare}`), `0x${bare}`);
  assert.equal(toBytes32(bare.toUpperCase()), `0x${bare}`);
});

test("toBytes32 rejects malformed or zero hashes", () => {
  assert.throws(() => toBytes32("0x1234"), ValidationError);
  assert.throws(() => toBytes32("zz".repeat(32)), ValidationError);
  assert.throws(() => toBytes32("0".repeat(64)), /zero hash/);
  assert.throws(() => toBytes32(Buffer.alloc(31)), ValidationError);
});

test("fromBytes32 strips the prefix", () => {
  assert.equal(fromBytes32(`0x${"AB".repeat(32)}`), "ab".repeat(32));
});

test("hashDocument is deterministic for the same content", () => {
  const a = hashDocument("title deed");
  const b = hashDocument(Buffer.from("title deed"));
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});
