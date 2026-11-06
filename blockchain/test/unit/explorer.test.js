const test = require("node:test");
const assert = require("node:assert/strict");
const { explorer } = require("../../src/utils/explorer");

test("builds HashScan testnet links", () => {
  assert.equal(
    explorer.transaction("0.0.1234@1700000000.000000001"),
    "https://hashscan.io/testnet/transaction/0.0.1234@1700000000.000000001",
  );
  assert.equal(explorer.account("0.0.1234"), "https://hashscan.io/testnet/account/0.0.1234");
  assert.equal(explorer.token("0.0.5678"), "https://hashscan.io/testnet/token/0.0.5678");
  assert.equal(explorer.topic("0.0.9999"), "https://hashscan.io/testnet/topic/0.0.9999");
  assert.equal(
    explorer.contract("0x" + "a".repeat(40)),
    `https://hashscan.io/testnet/contract/0x${"a".repeat(40)}`,
  );
});

test("refuses identifiers that could alter the URL path", () => {
  assert.throws(() => explorer.transaction("../account/0.0.1"));
  assert.throws(() => explorer.token("0.0.1?x=1"));
  assert.throws(() => explorer.account("0.0.1/../evil"));
});
