const test = require("node:test");
const assert = require("node:assert/strict");
const { Interface } = require("ethers");
const {
  ContractsClient,
  readArtifact,
  normalizeEvmKey,
} = require("../../src/hedera/contracts");
const { ConfigurationError, TransactionError } = require("../../src/errors");

test("readArtifact loads the compiled ABI", () => {
  const artifact = readArtifact("PropertyRegistry");
  assert.ok(Array.isArray(artifact.abi));
  assert.ok(artifact.abi.some((entry) => entry.name === "registerProperty"));
});

test("readArtifact explains how to fix a missing build", () => {
  assert.throws(() => readArtifact("DoesNotExist"), ConfigurationError);
});

test("normalizeEvmKey accepts 32-byte keys and rejects anything else", () => {
  const key = "ab".repeat(32);
  assert.equal(normalizeEvmKey(key), `0x${key}`);
  assert.equal(normalizeEvmKey(`0x${key}`), `0x${key}`);
  assert.throws(() => normalizeEvmKey("0x1234"), ConfigurationError);
  assert.throws(() => normalizeEvmKey(""), ConfigurationError);
});

test("decodes Solidity custom errors from relay revert data", () => {
  const artifact = readArtifact("PropertyRegistry");
  const iface = new Interface(artifact.abi);
  const data = iface.encodeErrorResult("PropertyAlreadyRegistered", ["LAND-2026-900"]);
  const client = new ContractsClient();

  const error = client._wrap(
    { data, shortMessage: "execution reverted (unknown custom error)" },
    "propertyRegistry.registerProperty() is not executable",
    { interface: iface },
  );

  assert.ok(error instanceof TransactionError);
  assert.equal(error.code, "PropertyAlreadyRegistered");
  assert.match(error.message, /PropertyAlreadyRegistered\("LAND-2026-900"\)/);
  assert.equal(error.details.data, data);
});

test("keeps the generic reason when the data is not a known custom error", () => {
  const artifact = readArtifact("PropertyRegistry");
  const iface = new Interface(artifact.abi);
  const client = new ContractsClient();

  const error = client._wrap(
    { shortMessage: "insufficient funds", data: "0xdeadbeef" },
    "propertyRegistry.registerProperty() transaction failed",
    { interface: iface },
  );

  assert.equal(error.code, "CONTRACT_CALL_FAILED");
  assert.match(error.message, /insufficient funds/);
});

test("contract writes require a signing key", async () => {
  const client = new ContractsClient({ privateKey: null });
  await assert.rejects(
    client.send("propertyRegistry", "registerProperty", ["LAND-2026-001", `0x${"a".repeat(64)}`]),
    ConfigurationError,
  );
});
