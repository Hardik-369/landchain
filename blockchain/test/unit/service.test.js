const test = require("node:test");
const assert = require("node:assert/strict");
const { BlockchainService } = require("../../src/services/blockchain.service");
const {
  ValidationError,
  ConfigurationError,
  TransactionError,
} = require("../../src/errors");

const TX_HASH = `0x${"d".repeat(64)}`;
const HEDERA_TX = "0.0.1234@1700000000.000000001";
const LEDGER_ADDRESS = `0x${"2".repeat(40)}`;

function buildService(overrides = {}) {
  const sent = [];
  const calls = [];

  const contracts = {
    address: () => `0x${"1".repeat(40)}`,
    call: async (name, method, args) => {
      calls.push({ name, method, args });
      if (overrides.call) {
        const result = overrides.call(name, method, args);
        if (result !== undefined) return result;
      }
      const defaults = {
        hasSupply: true,
        hasPool: true,
        getProperty: [`0x${"a".repeat(64)}`, 1_700_000_000n, 1_700_000_100n, 2n, 3n],
        getPropertyHashHistory: [`0x${"a".repeat(64)}`, `0x${"b".repeat(64)}`],
        verifyPropertyHash: true,
        getDocumentHashes: [`0x${"c".repeat(64)}`],
        getSupply: [1000n, 250n, 750n],
        balanceOf: 250n,
        ownershipBps: 2500n,
        getPool: [250_000n, 50_000n, 1_000n, 50_000n, 250n, 50n, true],
        fundingProgressBps: 2_000n,
        getListing: ["LAND-2026-001", `0x${"3".repeat(40)}`, 100n, 1_200n, `0x${"4".repeat(40)}`, 1_700_000_000n, 2n],
        reservationExpiresAt: 1_700_000_900n,
      };
      if (method in defaults) return defaults[method];
      return 0n;
    },
    send: async (name, method, args) => {
      sent.push({ name, method, args });
      return {
        contract: name,
        method,
        transactionHash: TX_HASH,
        status: "SUCCESS",
        success: true,
        blockNumber: 1,
        gasUsed: 21_000,
        explorerUrl: `https://hashscan.io/testnet/transaction/${TX_HASH}`,
        events: overrides.events ?? [],
      };
    },
    withSigner: () => contracts,
  };

  const token = {
    calls: [],
    createPropertyToken: async (params) => ({
      propertyId: params.propertyId,
      tokenId: "0.0.7001",
      name: params.name,
      symbol: params.symbol,
      decimals: 0,
      totalSupply: String(params.totalUnits),
      treasuryAccountId: "0.0.1234",
      transactionId: HEDERA_TX,
      status: "SUCCESS",
      explorerUrl: "https://hashscan.io/testnet/token/0.0.7001",
    }),
    allocateUnits: async (params) => {
      if (overrides.htsError) throw overrides.htsError;
      token.calls.push(params);
      return {
        tokenId: params.tokenId,
        fromAccountId: "0.0.1234",
        toAccountId: params.toAccountId,
        units: params.units,
        transactionId: HEDERA_TX,
        status: "SUCCESS",
        explorerUrl: "https://hashscan.io/testnet/transaction/0.0.1234@1700000000.000000001",
      };
    },
    transferUnits: async (params) => {
      if (overrides.htsError) throw overrides.htsError;
      token.calls.push(params);
      return {
        tokenId: params.tokenId,
        fromAccountId: params.fromAccountId,
        toAccountId: params.toAccountId,
        units: params.units,
        transactionId: HEDERA_TX,
        status: "SUCCESS",
        explorerUrl: "https://hashscan.io/testnet/transaction/0.0.1234@1700000000.000000001",
      };
    },
    getTokenBalance: async ({ tokenId, accountId }) => ({
      tokenId,
      accountId,
      units: 25,
      decimals: 0,
      explorerUrl: `https://hashscan.io/testnet/token/${tokenId}`,
    }),
    getTokenInfo: async () => ({ tokenId: "0.0.7001" }),
  };

  const wallet = {
    connectWallet: async ({ accountId }) => ({
      connected: true,
      network: "testnet",
      chainId: 296,
      accountId: /^0\.0\./.test(accountId) ? accountId : "0.0.1234",
      evmAddress: LEDGER_ADDRESS,
      balanceHbar: 100,
      balanceTinybar: 10_000_000_000,
      receiverSignatureRequired: false,
      createdAt: null,
      explorerUrl: `https://hashscan.io/testnet/account/${accountId}`,
    }),
    getAccountInfo: async (accountId) => wallet.connectWallet({ accountId }),
    checkAccount: async () => ({ exists: true }),
    resolveLedgerAddress: async () => LEDGER_ADDRESS,
    resolveAccountId: async (value) => (/^0\.0\./.test(value) ? value : "0.0.1234"),
    connectBrowserWallet: async () => ({ connected: true }),
  };

  const auditCalls = [];
  const consensus = {
    topicId: overrides.topicId === undefined ? "0.0.9999" : overrides.topicId,
    recordEvent: async (params) => {
      auditCalls.push(params);
      if (overrides.auditError) throw new Error(overrides.auditError);
      return {
        topicId: "0.0.9999",
        sequenceNumber: auditCalls.length,
        transactionId: HEDERA_TX,
        explorerUrl: "https://hashscan.io/testnet/transaction/0.0.1234@1700000000.000000001",
        topicUrl: "https://hashscan.io/testnet/topic/0.0.9999",
        event: params,
      };
    },
    getEventHistory: async () => [
      {
        sequenceNumber: 1,
        consensusTimestamp: "1700000000.000000001",
        payload: { type: "investment", propertyId: "LAND-2026-001", data: {} },
        explorerUrl: "https://hashscan.io/testnet/topic/0.0.9999",
      },
      {
        sequenceNumber: 2,
        consensusTimestamp: "1700000000.000000002",
        payload: { type: "investment", propertyId: "LAND-2026-002", data: {} },
        explorerUrl: "https://hashscan.io/testnet/topic/0.0.9999",
      },
    ],
  };

  const mirror = {
    getExchangeRate: async () => ({ hbarToUsd: 0.09 }),
    getAccountTransactions: async (accountId) => [
      {
        transactionId: HEDERA_TX,
        type: "CONTRACTCALL",
        status: "SUCCESS",
        success: true,
        consensusTimestamp: "1700000000.000000001",
        explorerUrl: "https://hashscan.io/testnet/transaction/0.0.1234@1700000000.000000001",
      },
    ],
    getAccountTokens: async () => [],
  };

  const service = new BlockchainService({
    mirror,
    consensus,
    token,
    contracts,
    wallet,
    cfg: {
      network: "testnet",
      chainId: 296,
      mirrorNodeUrl: "https://testnet.mirrornode.hedera.com",
      jsonRpcUrl: "https://testnet.hashio.io/api",
      explorerUrl: "https://hashscan.io/testnet",
      operatorId: "",
      operatorKey: "",
      contracts: {},
    },
  });

  return { service, sent, calls, token, consensus, auditCalls, mirror };
}

test("registerProperty anchors the hash and audits the event", async () => {
  const { service, sent, auditCalls } = buildService();
  const hash = "ab".repeat(32);

  const result = await service.registerProperty({
    propertyId: "LAND-2026-001",
    propertyHash: hash,
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].name, "propertyRegistry");
  assert.equal(sent[0].method, "registerProperty");
  assert.deepEqual(sent[0].args, ["LAND-2026-001", `0x${hash}`]);
  assert.equal(result.propertyHash, hash);
  assert.equal(result.transaction.transactionHash, TX_HASH);
  assert.equal(result.audit.recorded, true);
  assert.equal(auditCalls[0].type, "property_registered");
  assert.equal(auditCalls[0].propertyId, "LAND-2026-001");
});

test("registerProperty rejects an invalid hash without touching the chain", async () => {
  const { service, sent } = buildService();
  await assert.rejects(
    service.registerProperty({ propertyId: "LAND-2026-001", propertyHash: "0x1234" }),
    ValidationError,
  );
  assert.equal(sent.length, 0);
});

test("a failed HCS audit does not mask a confirmed on-chain registration", async () => {
  const { service } = buildService({ auditError: "topic unavailable" });
  const result = await service.registerProperty({
    propertyId: "LAND-2026-001",
    propertyHash: "ab".repeat(32),
  });

  assert.equal(result.transaction.success, true);
  assert.equal(result.audit.recorded, false);
  assert.match(result.audit.reason, /topic unavailable/);
});

test("storeDocumentHash returns the anchored index and document event", async () => {
  const { service, sent, auditCalls } = buildService({
    events: [{ event: "DocumentHashStored", args: { documentIndex: 2n } }],
  });

  const result = await service.storeDocumentHash({
    propertyId: "LAND-2026-001",
    documentHash: "cd".repeat(32),
    documentType: "title_deed",
  });

  assert.equal(result.documentIndex, 2);
  assert.deepEqual(sent[0].args, ["LAND-2026-001", `0x${"cd".repeat(32)}`, "title_deed"]);
  assert.equal(auditCalls[0].type, "document_verified");
});

test("recordPropertyEvent writes to HCS and needs a topic", async () => {
  const withTopic = buildService();
  const event = await withTopic.service.recordPropertyEvent({
    propertyId: "LAND-2026-001",
    eventType: "document_verified",
    data: { documentHash: "abc" },
  });
  assert.equal(event.sequenceNumber, 1);
  assert.equal(event.eventType, "document_verified");
  assert.match(event.explorerUrl, /hashscan\.io\/testnet\/transaction\//);

  const withoutTopic = buildService({ topicId: null });
  await assert.rejects(
    withoutTopic.service.recordPropertyEvent({
      propertyId: "LAND-2026-001",
      eventType: "document_verified",
    }),
    ConfigurationError,
  );
});

test("getPropertyEvents filters the topic history by property", async () => {
  const { service } = buildService();
  const events = await service.getPropertyEvents({ propertyId: "LAND-2026-001" });
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.propertyId, "LAND-2026-001");
});

test("createPropertyToken uses HTS and records the token event", async () => {
  const { service, auditCalls } = buildService();
  const token = await service.createPropertyToken({
    propertyId: "LAND-2026-001",
    symbol: "LAND900",
    totalUnits: 1000,
  });

  assert.equal(token.tokenId, "0.0.7001");
  assert.equal(token.totalSupply, "1000");
  assert.equal(token.audit.recorded, true);
  assert.equal(auditCalls[0].type, "token_created");
});

test("allocateUnits writes the ledger then moves HTS units", async () => {
  const { service, sent, token } = buildService();

  const result = await service.allocateUnits({
    propertyId: "LAND-2026-001",
    tokenId: "0.0.7001",
    investorAccountId: "0.0.2002",
    units: 10,
  });

  assert.equal(sent[0].name, "tokenAllocation");
  assert.equal(sent[0].method, "allocate");
  assert.deepEqual(sent[0].args, ["LAND-2026-001", LEDGER_ADDRESS, 10]);
  assert.equal(token.calls[0].toAccountId, "0.0.2002");
  assert.equal(result.balance.units, 25);
  assert.equal(result.audit.recorded, true);
});

test("allocateUnits refuses to run before the supply is configured", async () => {
  const { service, sent } = buildService({ call: (name, method) => (method === "hasSupply" ? false : undefined) });
  await assert.rejects(
    service.allocateUnits({
      propertyId: "LAND-2026-001",
      tokenId: "0.0.7001",
      investorAccountId: "0.0.2002",
      units: 10,
    }),
    /no supply/,
  );
  assert.equal(sent.length, 0);
});

test("an HTS failure after the ledger write is reported with the ledger tx", async () => {
  const { service } = buildService({ htsError: new Error("TOKEN_NOT_ASSOCIATED_TO_ACCOUNT") });

  await assert.rejects(
    service.allocateUnits({
      propertyId: "LAND-2026-001",
      tokenId: "0.0.7001",
      investorAccountId: "0.0.2002",
      units: 10,
    }),
    (error) => {
      assert.ok(error instanceof TransactionError);
      assert.equal(error.details.allocationTransactionHash, TX_HASH);
      assert.match(error.details.compensation, /transferUnits/);
      return true;
    },
  );
});

test("transferUnits settles HTS first and mirrors the ledger transfer", async () => {
  const { service, sent, auditCalls } = buildService();
  const result = await service.transferUnits({
    propertyId: "LAND-2026-001",
    tokenId: "0.0.7001",
    fromAccountId: "0.0.1234",
    toAccountId: "0.0.2002",
    units: 5,
  });

  assert.equal(sent[0].method, "transferUnits");
  assert.deepEqual(sent[0].args, ["LAND-2026-001", LEDGER_ADDRESS, LEDGER_ADDRESS, 5]);
  assert.equal(result.units, 5);
  assert.equal(auditCalls[0].type, "ownership_transfer");
});

test("getTokenBalance delegates to the HTS token service", async () => {
  const { service } = buildService();
  const balance = await service.getTokenBalance({ tokenId: "0.0.7001", accountId: "0.0.2002" });
  assert.equal(balance.units, 25);
  assert.equal(balance.tokenId, "0.0.7001");
});

test("getTransactionHistory validates the account and returns explorer links", async () => {
  const { service } = buildService();
  const history = await service.getTransactionHistory({ accountId: "0.0.1234", limit: 5 });
  assert.equal(history.count, 1);
  assert.equal(history.transactions[0].status, "SUCCESS");
  assert.equal(history.explorerUrl, "https://hashscan.io/testnet/account/0.0.1234");

  await assert.rejects(service.getTransactionHistory({ accountId: "nope" }), ValidationError);
});

test("getPropertyRecord converts on-chain values and verifies the hash", async () => {
  const { service } = buildService();
  const record = await service.getPropertyRecord({
    propertyId: "LAND-2026-001",
    propertyHash: "ab".repeat(32),
  });

  assert.equal(record.propertyHash, "a".repeat(64));
  assert.equal(record.version, 3);
  assert.equal(record.documentCount, 2);
  assert.equal(record.registeredAt, new Date(1_700_000_000_000).toISOString());
  assert.equal(record.verified, true);
  assert.deepEqual(record.hashHistory, ["a".repeat(64), "b".repeat(64)]);
});

test("verifyDocumentHash checks every anchored digest", async () => {
  const { service } = buildService();
  const ok = await service.verifyDocumentHash({
    propertyId: "LAND-2026-001",
    documentHash: "cc".repeat(32),
  });
  assert.equal(ok.verified, true);

  const missing = await service.verifyDocumentHash({
    propertyId: "LAND-2026-001",
    documentHash: "dd".repeat(32),
  });
  assert.equal(missing.verified, false);
});

test("getInvestmentPool normalises bigint terms", async () => {
  const { service } = buildService();
  const pool = await service.getInvestmentPool("LAND-2026-001");
  assert.deepEqual(pool, {
    propertyId: "LAND-2026-001",
    targetAmount: "250000",
    minInvestment: "50000",
    unitPrice: "1000",
    amountRaised: "50000",
    totalUnits: 250,
    unitsSold: 50,
    unitsRemaining: 200,
    fundingProgressBps: 2000,
    funded: false,
    open: true,
  });
});

test("getResaleListing maps the status enum and reservation expiry", async () => {
  const { service } = buildService();
  const listing = await service.getResaleListing(0);
  assert.equal(listing.status, "RESERVED");
  assert.equal(listing.reservedBy, `0x${"4".repeat(40)}`);
  assert.equal(listing.reservationExpiresAt, new Date(1_700_000_900_000).toISOString());
});

test("health reports degraded without operator credentials", async () => {
  const { service } = buildService();
  const health = await service.health();
  assert.equal(health.mirrorNode.reachable, true);
  assert.equal(health.operator.configured, false);
  assert.equal(health.status, "degraded");
});

test("getExplorerLinks only includes the requested entities", async () => {
  const { service } = buildService();
  const links = service.getExplorerLinks({ tokenId: "0.0.7001", topicId: "0.0.9999" });
  assert.equal(links.token, "https://hashscan.io/testnet/token/0.0.7001");
  assert.equal(links.topic, "https://hashscan.io/testnet/topic/0.0.9999");
  assert.equal(links.account, undefined);
  assert.equal(links.network, "https://hashscan.io/testnet");
});
