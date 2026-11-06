const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MirrorNodeClient,
  normalizeTransactionId,
  tinybarToHbar,
} = require("../../src/hedera/mirror");
const { ValidationError, NotFoundError, NetworkError } = require("../../src/errors");

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("normalizeTransactionId converts @ form to the mirror dash form", () => {
  assert.equal(
    normalizeTransactionId("0.0.1234@1700000000.123456789"),
    "0.0.1234-1700000000-123456789",
  );
  assert.equal(
    normalizeTransactionId("0.0.1234-1700000000-123456789"),
    "0.0.1234-1700000000-123456789",
  );
  assert.equal(normalizeTransactionId("not-a-transaction"), null);
});

test("tinybarToHbar keeps 8 decimal places", () => {
  assert.equal(tinybarToHbar(100_000_000), 1);
  assert.equal(tinybarToHbar(123_456_789), 1.23456789);
  assert.equal(tinybarToHbar(0), 0);
});

test("getAccount normalises the mirror response", async (t) => {
  const mirror = new MirrorNodeClient({ baseUrl: "https://mirror.test" });
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.match(String(url), /\/api\/v1\/accounts\/0\.0\.1234$/);
    return jsonResponse({
      account: "0.0.1234",
      evm_address: `0x${"a".repeat(40)}`,
      key: { _type: "ECDSA_SECP256K1", key: "302a" },
      balance: { balance: 500_000_000 },
      deleted: false,
      created_timestamp: "1700000000.000000001",
    });
  });

  const account = await mirror.getAccount("0.0.1234");
  assert.equal(account.accountId, "0.0.1234");
  assert.equal(account.balanceHbar, 5);
  assert.equal(account.evmAddress, `0x${"a".repeat(40)}`);
  assert.equal(account.keyType, "ECDSA_SECP256K1");
  assert.equal(account.explorerUrl, "https://hashscan.io/testnet/account/0.0.1234");
});

test("getAccount rejects malformed identifiers before any request", async () => {
  const mirror = new MirrorNodeClient({ baseUrl: "https://mirror.test" });
  await assert.rejects(mirror.getAccount("1234"), ValidationError);
});

test("getTokenBalance returns 0 when the account is not associated", async (t) => {
  const mirror = new MirrorNodeClient({ baseUrl: "https://mirror.test" });
  t.mock.method(globalThis, "fetch", async () => jsonResponse({ _status: { messages: [] } }, 404));
  assert.equal(await mirror.getTokenBalance("0.0.5678", "0.0.1234"), 0);
});

test("getTokenBalance reads the relationship balance", async (t) => {
  const mirror = new MirrorNodeClient({ baseUrl: "https://mirror.test" });
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.match(String(url), /\/accounts\/0\.0\.1234\/tokens\/0\.0\.5678$/);
    return jsonResponse({ token_id: "0.0.5678", balance: 250 });
  });
  assert.equal(await mirror.getTokenBalance("0.0.5678", "0.0.1234"), 250);
});

test("an EVM transaction hash is looked up as a contract result", async (t) => {
  const mirror = new MirrorNodeClient({ baseUrl: "https://mirror.test" });
  const hash = `0x${"b".repeat(64)}`;
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.match(String(url), new RegExp(`/contracts/results/${hash}$`));
    return jsonResponse({
      status: "0x1",
      transaction_id: "0.0.1234-1700000000-000000001",
      contract_id: "0.0.7777",
      gas_used: 21000,
      timestamp: "1700000000.000000001",
    });
  });

  const transaction = await mirror.getTransaction(hash);
  assert.equal(transaction.kind, "evm");
  assert.equal(transaction.success, true);
  assert.equal(transaction.status, "SUCCESS");
  assert.equal(transaction.contractId, "0.0.7777");
});

test("a Hedera transaction ID is normalised and its status extracted", async (t) => {
  const mirror = new MirrorNodeClient({ baseUrl: "https://mirror.test" });
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.match(String(url), /\/transactions\/0\.0\.1234-1700000000-123456789$/);
    return jsonResponse({
      transactions: [
        {
          transaction_id: "0.0.1234-1700000000-123456789",
          name: "CONSENSUSSUBMITMESSAGE",
          result: "SUCCESS",
          charged_tx_fee: 100000,
          consensus_timestamp: "1700000000.123456789",
          transfers: [{ account: "0.0.1234", amount: -100000 }],
        },
      ],
    });
  });

  const transaction = await mirror.getTransaction("0.0.1234@1700000000.123456789");
  assert.equal(transaction.kind, "hedera");
  assert.equal(transaction.type, "CONSENSUSSUBMITMESSAGE");
  assert.equal(transaction.success, true);
  assert.equal(transaction.chargedFeeTinybar, 100000);
  assert.equal(transaction.transfers[0].accountId, "0.0.1234");
});

test("account history uses the transactions endpoint with account.id", async (t) => {
  const mirror = new MirrorNodeClient({ baseUrl: "https://mirror.test" });
  t.mock.method(globalThis, "fetch", async (url) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/api/v1/transactions");
    assert.equal(parsed.searchParams.get("account.id"), "0.0.1234");
    assert.equal(parsed.searchParams.get("limit"), "3");
    return jsonResponse({
      transactions: [
        {
          transaction_id: "0.0.1234-1700000000-000000001",
          name: "CONTRACTCALL",
          result: "SUCCESS",
          consensus_timestamp: "1700000000.000000001",
          charged_tx_fee: 100000,
        },
      ],
    });
  });

  const history = await mirror.getAccountTransactions("0.0.1234", { limit: 3 });
  assert.equal(history.length, 1);
  assert.equal(history[0].success, true);
  assert.equal(history[0].type, "CONTRACTCALL");
});

test("rejects an unrecognisable transaction reference", async () => {
  const mirror = new MirrorNodeClient({ baseUrl: "https://mirror.test" });
  await assert.rejects(mirror.getTransaction("0x1234"), ValidationError);
});

test("maps a 404 to NotFoundError and other statuses to NetworkError", async (t) => {
  const mirror = new MirrorNodeClient({ baseUrl: "https://mirror.test" });
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });

  globalThis.fetch = async () => jsonResponse({}, 404);
  await assert.rejects(mirror.getAccount("0.0.9999"), NotFoundError);

  globalThis.fetch = async () => jsonResponse({}, 503);
  await assert.rejects(mirror.getAccount("0.0.9999"), NetworkError);
});

test("getTopicMessages decodes base64 JSON payloads", async (t) => {
  const mirror = new MirrorNodeClient({ baseUrl: "https://mirror.test" });
  const payload = { v: 1, type: "investment", propertyId: "LAND-2026-001" };
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse({
      messages: [
        {
          topic_id: "0.0.9999",
          sequence_number: 3,
          consensus_timestamp: "1700000000.000000003",
          message: Buffer.from(JSON.stringify(payload)).toString("base64"),
        },
      ],
    }),
  );

  const messages = await mirror.getTopicMessages("0.0.9999");
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].payload, payload);
  assert.equal(messages[0].sequenceNumber, 3);
});

test("getTopicMessages rejects a non-topic ID", async () => {
  const mirror = new MirrorNodeClient({ baseUrl: "https://mirror.test" });
  await assert.rejects(mirror.getTopicMessages("topic"), ValidationError);
});
