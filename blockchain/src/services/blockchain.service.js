/**
 * LANDCHAIN blockchain service.
 *
 * The single reusable entry point for every Hedera operation. Contributor 2's
 * backend imports this service (directly or through the Express adapter) and
 * calls the functions below; it never touches the Hedera SDK directly.
 *
 * Required integration surface:
 *   registerProperty()      storeDocumentHash()     recordPropertyEvent()
 *   createPropertyToken()   allocateUnits()         transferUnits()
 *   getTokenBalance()       getTransactionHistory()
 *
 * Plus reads/writes for the investment pool, resale escrow and mirror lookups.
 *
 * Design rules enforced here:
 *  - Hedera Testnet only (config.assertTestnet).
 *  - No fabricated transaction IDs: every ID comes from an SDK receipt or the
 *    mirror node.
 *  - Writes are signed server-side by the operator account; user-owned wallet
 *    actions (listing/reserving) require the user's own signature and are
 *    documented as wallet-signed flows.
 *  - Every on-chain write is mirrored into the HCS audit topic. If the audit
 *    write fails, the confirmed chain transaction is still returned and the
 *    failure is reported in `audit`, never hidden.
 */
const { config, TESTNET, assertTestnet } = require("../config");
const { ValidationError, ConfigurationError, TransactionError } = require("../errors");
const { sha256Hex, toBytes32, fromBytes32 } = require("../utils/hash");
const { explorer } = require("../utils/explorer");
const validation = require("../utils/validation");
const { MirrorNodeClient } = require("../hedera/mirror");
const { ConsensusService } = require("../hedera/consensus");
const { TokenService } = require("../hedera/token");
const { ContractsClient } = require("../hedera/contracts");
const { WalletService } = require("../hedera/wallet");

const LISTING_STATUS = ["NONE", "ACTIVE", "RESERVED", "COMPLETED", "CANCELLED"];

function isoFromSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function addressUrl(address) {
  return explorer.contract(address);
}

function requireContractValue(value) {
  return value === undefined || value === null ? null : value;
}

class BlockchainService {
  constructor({ mirror, consensus, token, contracts, wallet, cfg = config } = {}) {
    this.config = cfg;
    this.mirror = mirror ?? new MirrorNodeClient();
    this.consensus = consensus ?? new ConsensusService();
    this.token = token ?? new TokenService({ mirror: this.mirror });
    this.contracts = contracts ?? new ContractsClient();
    this.wallet = wallet ?? new WalletService({ mirror: this.mirror });
  }

  // =====================================================================
  // 1. Wallet
  // =====================================================================

  /** Connect a Hedera-compatible wallet and read its account state. */
  connectWallet({ accountId }) {
    assertTestnet();
    return this.wallet.connectWallet({ accountId });
  }

  getAccountInfo(accountId) {
    assertTestnet();
    return this.wallet.getAccountInfo(accountId);
  }

  checkAccount(accountId) {
    return this.wallet.checkAccount(accountId);
  }

  /** Browser EIP-1193 wallet (HashPack / Blade / MetaMask on Hedera Testnet). */
  connectBrowserWallet({ provider } = {}) {
    assertTestnet();
    return this.wallet.connectBrowserWallet({ provider });
  }

  // =====================================================================
  // 2 + 3. Property hash registry & HCS activity log
  // =====================================================================

  /**
   * Register a property: anchors the property hash in PropertyRegistry and
   * appends a `property_registered` event to HCS.
   */
  async registerProperty({ propertyId, propertyHash, actor, metadata = {} }) {
    assertTestnet();
    const id = validation.propertyId(propertyId);
    const hash = validation.propertyHash(propertyHash);

    const transaction = await this.contracts.send("propertyRegistry", "registerProperty", [
      id,
      hash,
    ]);

    const audit = await this.#audit("property_registered", id, {
      propertyHash: fromBytes32(hash),
      contractTransactionHash: transaction.transactionHash,
      ...metadata,
    }, actor);

    return {
      propertyId: id,
      propertyHash: fromBytes32(hash),
      registeredAt: new Date().toISOString(),
      network: TESTNET.name,
      transaction,
      explorerUrl: transaction.explorerUrl,
      audit,
    };
  }

  /** Anchor a new property hash version (property metadata changed). */
  async updatePropertyHash({ propertyId, propertyHash, actor, metadata = {} }) {
    const id = validation.propertyId(propertyId);
    const hash = validation.propertyHash(propertyHash);
    const transaction = await this.contracts.send("propertyRegistry", "updatePropertyHash", [
      id,
      hash,
    ]);
    const audit = await this.#audit("property_hash_updated", id, {
      propertyHash: fromBytes32(hash),
      contractTransactionHash: transaction.transactionHash,
      ...metadata,
    }, actor);
    return { propertyId: id, propertyHash: fromBytes32(hash), transaction, audit };
  }

  /** Anchor a document digest and record the verification event. */
  async storeDocumentHash({ propertyId, documentHash, documentType = "other", actor, metadata = {} }) {
    assertTestnet();
    const id = validation.propertyId(propertyId);
    const hash = toBytes32(documentHash, "documentHash");
    const type = validation.documentType(documentType);

    const transaction = await this.contracts.send("propertyRegistry", "storeDocumentHash", [
      id,
      hash,
      type,
    ]);
    const stored = transaction.events.find((event) => event.event === "DocumentHashStored");
    const documentIndex = stored ? Number(stored.args.documentIndex ?? 0) : null;

    const audit = await this.#audit("document_verified", id, {
      documentHash: fromBytes32(hash),
      documentType: type,
      documentIndex,
      contractTransactionHash: transaction.transactionHash,
      ...metadata,
    }, actor);

    return {
      propertyId: id,
      documentHash: fromBytes32(hash),
      documentType: type,
      documentIndex,
      transaction,
      explorerUrl: transaction.explorerUrl,
      audit,
    };
  }

  /** Append a raw activity event to the HCS topic. */
  async recordPropertyEvent({ propertyId, eventType, data = {}, actor }) {
    assertTestnet();
    const id = validation.propertyId(propertyId);
    const type = validation.eventType(eventType);
    if (!this.consensus.topicId) {
      throw new ConfigurationError(
        "HEDERA_PROPERTY_TOPIC_ID is not configured. Run `npm run topic:create` and add the topic ID to blockchain/.env.",
        { code: "MISSING_TOPIC_ID" },
      );
    }
    const record = await this.consensus.recordEvent({
      type,
      propertyId: id,
      data,
      actor,
    });
    return {
      propertyId: id,
      eventType: type,
      network: TESTNET.name,
      sequenceNumber: record.sequenceNumber,
      transactionId: record.transactionId,
      explorerUrl: record.explorerUrl,
      topicUrl: record.topicUrl,
      consensus: record.event,
    };
  }

  /** Read the property's append-only activity history back from HCS. */
  async getPropertyEvents({ propertyId, limit = 50, order = "asc", sequenceNumber } = {}) {
    const id = validation.propertyId(propertyId);
    if (!this.consensus.topicId) {
      throw new ConfigurationError("HEDERA_PROPERTY_TOPIC_ID is not configured.", {
        code: "MISSING_TOPIC_ID",
      });
    }
    const messages = await this.consensus.getEventHistory(
      { limit, order, sequenceNumber },
      { mirror: this.mirror },
    );
    return messages
      .filter((message) => message.payload?.propertyId === id)
      .map((message, index) => ({ ...message, eventType: message.payload?.type ?? null, index }));
  }

  /** Full HCS history for the platform (all properties). */
  async getActivityLog({ limit = 50, order = "desc", sequenceNumber } = {}) {
    if (!this.consensus.topicId) {
      throw new ConfigurationError("HEDERA_PROPERTY_TOPIC_ID is not configured.", {
        code: "MISSING_TOPIC_ID",
      });
    }
    return this.consensus.getEventHistory(
      { limit, order, sequenceNumber },
      { mirror: this.mirror },
    );
  }

  // =====================================================================
  // 4. Hedera Token Service
  // =====================================================================

  /** Create the property-specific HTS fungible token (1 unit = 1 token). */
  async createPropertyToken({ propertyId, name, symbol, totalUnits, actor }) {
    assertTestnet();
    const id = validation.propertyId(propertyId);
    const token = await this.token.createPropertyToken({ propertyId: id, name, symbol, totalUnits });

    const audit = await this.#audit("token_created", id, {
      tokenId: token.tokenId,
      symbol: token.symbol,
      totalSupply: token.totalSupply,
      hederaTransactionId: token.transactionId,
    }, actor);

    return {
      propertyId: id,
      ...token,
      audit,
    };
  }

  /** Read token metadata (name, symbol, supply, treasury). */
  async getTokenInfo(tokenId) {
    return this.token.getTokenInfo(tokenId);
  }

  /** Read an investor's token balance from the mirror node. */
  async getTokenBalance({ tokenId, accountId }) {
    assertTestnet();
    return this.token.getTokenBalance({ tokenId, accountId });
  }

  /** All token balances for an account. */
  async getAccountTokens(accountId) {
    const id = validation.accountId(accountId);
    return this.mirror.getAccountTokens(id);
  }

  /**
   * Allocate units to an investor.
   *
   * Two ledgers move together:
   *  1. TokenAllocation (Solidity) - records the allocation and investor balance.
   *  2. HTS - transfers the token units from the treasury to the investor.
   *
   * The contract is written first because it enforces supply limits cheaply. If
   * the HTS leg fails, the returned error includes the confirmed ledger
   * transaction so the operator can compensate (transferUnits back to treasury).
   */
  async allocateUnits({ propertyId, tokenId, investorAccountId, units, actor, metadata = {} }) {
    assertTestnet();
    const id = validation.propertyId(propertyId);
    const token = validation.entityId(tokenId, "tokenId");
    const amount = validation.units(units);

    const investor = await this.wallet.connectWallet({ accountId: investorAccountId });
    const ledgerAddress = await this.wallet.resolveLedgerAddress(investorAccountId);

    const hasSupply = await this.contracts.call("tokenAllocation", "hasSupply", [id]);
    if (!hasSupply) {
      throw new ValidationError(
        `TokenAllocation has no supply for ${id}. Call configurePropertyOnChain() or setPropertySupply() first.`,
        { code: "SUPPLY_NOT_SET" },
      );
    }

    const allocation = await this.contracts.send("tokenAllocation", "allocate", [
      id,
      ledgerAddress,
      amount,
    ]);

    let hts;
    try {
      hts = await this.token.allocateUnits({
        tokenId: token,
        toAccountId: investor.accountId,
        units: amount,
      });
    } catch (error) {
      throw new TransactionError(
        `Units were recorded on the allocation ledger but the HTS transfer failed: ${error.message}`,
        {
          code: "HTS_ALLOCATION_FAILED",
          cause: error,
          details: {
            propertyId: id,
            tokenId: token,
            investorAccountId: investor.accountId,
            units: amount,
            allocationTransactionHash: allocation.transactionHash,
            compensation: `transferUnits(${id}, ${ledgerAddress}, operatorAddress, ${amount}) to reverse the ledger entry`,
          },
        },
      );
    }

    const audit = await this.#audit("units_allocated", id, {
      tokenId: token,
      investorAccountId: investor.accountId,
      evmAddress: ledgerAddress,
      units: amount,
      contractTransactionHash: allocation.transactionHash,
      hederaTransactionId: hts.transactionId,
      ...metadata,
    }, actor);

    return {
      propertyId: id,
      tokenId: token,
      investorAccountId: investor.accountId,
      evmAddress: ledgerAddress,
      units: amount,
      balance: await this.getTokenBalance({ tokenId: token, accountId: investor.accountId }),
      allocationTransaction: allocation,
      htsTransaction: hts,
      audit,
    };
  }

  /**
   * Move units between accounts.
   *
   * HTS transfers must be signed by the current holder. Server-side this works
   * when `fromAccountId` is the operator account. For investor-held units pass
   * `signerKey` from a trusted server-side key store (never from HTTP input), or
   * settle through the resale escrow where the wallet signs.
   */
  async transferUnits({
    propertyId,
    tokenId,
    fromAccountId,
    toAccountId,
    units,
    signerKey,
    actor,
    metadata = {},
  }) {
    assertTestnet();
    const id = validation.propertyId(propertyId);
    const token = validation.entityId(tokenId, "tokenId");
    const amount = validation.units(units);

    const from = await this.wallet.resolveAccountId(fromAccountId);
    const to = await this.wallet.resolveAccountId(toAccountId);
    const fromLedger = await this.wallet.resolveLedgerAddress(from);
    const toLedger = await this.wallet.resolveLedgerAddress(to);

    const hts = await this.token.transferUnits({
      tokenId: token,
      fromAccountId: from,
      toAccountId: to,
      units: amount,
      signerKey,
    });

    const ledger = await this.contracts.send("tokenAllocation", "transferUnits", [
      id,
      fromLedger,
      toLedger,
      amount,
    ]);

    const audit = await this.#audit("ownership_transfer", id, {
      tokenId: token,
      fromAccountId: from,
      toAccountId: to,
      units: amount,
      hederaTransactionId: hts.transactionId,
      contractTransactionHash: ledger.transactionHash,
      ...metadata,
    }, actor);

    return {
      propertyId: id,
      tokenId: token,
      fromAccountId: from,
      toAccountId: to,
      units: amount,
      fromBalance: await this.getTokenBalance({ tokenId: token, accountId: from }),
      toBalance: await this.getTokenBalance({ tokenId: token, accountId: to }),
      htsTransaction: hts,
      ledgerTransaction: ledger,
      audit,
    };
  }

  // =====================================================================
  // 5. Solidity smart contracts
  // =====================================================================

  /** Wire a property into the Solidity layer: unit supply + investment pool. */
  async configurePropertyOnChain({
    propertyId,
    totalUnits,
    targetAmount,
    minInvestment,
    unitPrice,
    actor,
  }) {
    const id = validation.propertyId(propertyId);
    const supply = validation.units(totalUnits, "totalUnits");
    const target = validation.positiveIntegerString(targetAmount, "targetAmount");
    const minimum = validation.positiveIntegerString(minInvestment, "minInvestment");
    const price = validation.positiveIntegerString(unitPrice, "unitPrice");
    if (minimum > target) {
      throw new ValidationError("minInvestment cannot be greater than targetAmount.");
    }

    const results = { propertyId: id };
    const hasSupply = await this.contracts.call("tokenAllocation", "hasSupply", [id]);
    if (!hasSupply) {
      results.supply = await this.contracts.send("tokenAllocation", "setPropertySupply", [
        id,
        supply,
      ]);
    } else {
      results.supply = { skipped: true, reason: "Supply already set." };
    }

    const hasPool = await this.contracts.call("investmentPool", "hasPool", [id]);
    if (!hasPool) {
      results.pool = await this.contracts.send("investmentPool", "openPool", [
        id,
        target,
        minimum,
        price,
        supply,
      ]);
    } else {
      results.pool = { skipped: true, reason: "Pool already open." };
    }

    results.audit = await this.#audit("property_configured", id, {
      totalUnits: supply,
      targetAmount: String(target),
      minInvestment: String(minimum),
      unitPrice: String(price),
    }, actor);

    return results;
  }

  /** Validate and record a settled investment against the funding target. */
  async recordInvestment({ propertyId, investorAccountId, units, amount, paymentRef, actor }) {
    const id = validation.propertyId(propertyId);
    const investor = await this.wallet.resolveLedgerAddress(investorAccountId);
    const amountUnits = validation.units(units);
    const value = validation.positiveIntegerString(amount, "amount");
    const ref = validation.paymentRef(paymentRef);

    const transaction = await this.contracts.send("investmentPool", "recordInvestment", [
      id,
      investor,
      amountUnits,
      value,
      ref,
    ]);

    const audit = await this.#audit("investment", id, {
      investorAccountId,
      evmAddress: investor,
      units: amountUnits,
      amount: String(value),
      paymentRef: fromBytes32(ref),
      contractTransactionHash: transaction.transactionHash,
    }, actor);

    return {
      propertyId: id,
      investorAccountId,
      evmAddress: investor,
      units: amountUnits,
      amount: String(value),
      transaction,
      funding: await this.getInvestmentPool(id),
      audit,
    };
  }

  /** Read pool terms and funding progress. */
  async getInvestmentPool(propertyId) {
    const id = validation.propertyId(propertyId);
    const [targetAmount, minInvestment, unitPrice, amountRaised, totalUnits, unitsSold, open] =
      await this.contracts.call("investmentPool", "getPool", [id]);
    const bps = await this.contracts.call("investmentPool", "fundingProgressBps", [id]);

    return {
      propertyId: id,
      targetAmount: targetAmount.toString(),
      minInvestment: minInvestment.toString(),
      unitPrice: unitPrice.toString(),
      amountRaised: amountRaised.toString(),
      totalUnits: Number(totalUnits),
      unitsSold: Number(unitsSold),
      unitsRemaining: Number(totalUnits) - Number(unitsSold),
      fundingProgressBps: Number(bps),
      funded: amountRaised >= targetAmount,
      open: Boolean(open),
    };
  }

  /** Read the on-chain property record and verify the supplied hash. */
  async getPropertyRecord({ propertyId, propertyHash } = {}) {
    const id = validation.propertyId(propertyId);
    const [hash, registeredAt, updatedAt, documentCount, version] = await this.contracts.call(
      "propertyRegistry",
      "getProperty",
      [id],
    );
    const history = await this.contracts.call("propertyRegistry", "getPropertyHashHistory", [id]);

    const record = {
      propertyId: id,
      propertyHash: fromBytes32(hash),
      registeredAt: isoFromSeconds(registeredAt),
      updatedAt: isoFromSeconds(updatedAt),
      documentCount: Number(documentCount),
      version: Number(version),
      hashHistory: history.map(fromBytes32),
      network: TESTNET.name,
      explorerUrl: addressUrl(this.contracts.address("propertyRegistry")),
    };

    if (propertyHash) {
      const candidate = toBytes32(propertyHash, "propertyHash");
      record.verified = await this.contracts.call("propertyRegistry", "verifyPropertyHash", [
        id,
        candidate,
      ]);
      record.matchesOnChain = record.verified;
    }
    return record;
  }

  /** Check a document digest against every anchored hash for the property. */
  async verifyDocumentHash({ propertyId, documentHash }) {
    const id = validation.propertyId(propertyId);
    const hash = toBytes32(documentHash, "documentHash");
    const anchored = await this.contracts.call("propertyRegistry", "getDocumentHashes", [id]);
    const hashes = anchored.map(fromBytes32);
    return {
      propertyId: id,
      documentHash: fromBytes32(hash),
      verified: hashes.includes(fromBytes32(hash)),
      anchoredDocuments: hashes.length,
    };
  }

  /** List registered property IDs from the contract. */
  async getRegisteredProperties() {
    return this.contracts.call("propertyRegistry", "getPropertyIds", []);
  }

  /** Unit supply and investor balance from the allocation ledger. */
  async getAllocation({ propertyId, investorAccountId }) {
    const id = validation.propertyId(propertyId);
    const [totalUnits, allocatedUnits, unallocatedUnits] = await this.contracts.call(
      "tokenAllocation",
      "getSupply",
      [id],
    );
    const result = {
      propertyId: id,
      totalUnits: Number(totalUnits),
      allocatedUnits: Number(allocatedUnits),
      unallocatedUnits: Number(unallocatedUnits),
    };
    if (investorAccountId) {
      const address = await this.wallet.resolveLedgerAddress(investorAccountId);
      result.investorAccountId = investorAccountId;
      result.evmAddress = address;
      result.units = Number(
        await this.contracts.call("tokenAllocation", "balanceOf", [id, address]),
      );
      result.ownershipBps = Number(
        await this.contracts.call("tokenAllocation", "ownershipBps", [id, address]),
      );
    }
    return result;
  }

  // =====================================================================
  // 6. Resale escrow
  // =====================================================================

  /**
   * Escrow units and create a resale listing.
   * Signed by the operator by default; pass `signerKey` for an investor-held
   * position from a trusted server-side key store.
   */
  async createResaleListing({ propertyId, units, pricePerUnit, signerKey, actor }) {
    const id = validation.propertyId(propertyId);
    const amount = validation.units(units, "units");
    const price = validation.positiveIntegerString(pricePerUnit, "pricePerUnit");
    const client = signerKey ? this.contracts.withSigner(signerKey) : this.contracts;

    const transaction = await client.send("resale", "createListing", [id, amount, price]);
    const created = transaction.events.find((event) => event.event === "ListingCreated");
    const listingId = created ? Number(created.args.listingId) : null;

    const audit = await this.#audit("resale_listed", id, {
      listingId,
      units: amount,
      pricePerUnit: String(price),
      contractTransactionHash: transaction.transactionHash,
    }, actor);

    return { propertyId: id, listingId, units: amount, pricePerUnit: String(price), transaction, audit };
  }

  /** Reserve a listing (buyer-signed; server-side uses the operator key). */
  async reserveUnits({ listingId, signerKey }) {
    const id = Number(listingId);
    if (!Number.isInteger(id) || id < 0) throw new ValidationError("listingId must be a non-negative integer.");
    const client = signerKey ? this.contracts.withSigner(signerKey) : this.contracts;
    const transaction = await client.send("resale", "reserveUnits", [id]);
    return { listingId: id, transaction, listing: await this.getResaleListing(id) };
  }

  async cancelReservation({ listingId, signerKey }) {
    const id = Number(listingId);
    if (!Number.isInteger(id) || id < 0) throw new ValidationError("listingId must be a non-negative integer.");
    const client = signerKey ? this.contracts.withSigner(signerKey) : this.contracts;
    const transaction = await client.send("resale", "cancelReservation", [id]);
    return { listingId: id, transaction };
  }

  /** Settle a reserved resale (operator only). */
  async completeResale({ listingId, paymentRef, actor }) {
    const id = Number(listingId);
    if (!Number.isInteger(id) || id < 0) throw new ValidationError("listingId must be a non-negative integer.");
    const ref = validation.paymentRef(paymentRef);

    const transaction = await this.contracts.send("resale", "completeResale", [id, ref]);
    const listing = await this.getResaleListing(id);

    const audit = await this.#audit("resale_completed", listing.propertyId, {
      listingId: id,
      units: listing.units,
      pricePerUnit: listing.pricePerUnit,
      buyer: listing.reservedBy,
      paymentRef: fromBytes32(ref),
      contractTransactionHash: transaction.transactionHash,
    }, actor);

    return { listingId: id, listing, transaction, audit };
  }

  async cancelListing({ listingId, signerKey }) {
    const id = Number(listingId);
    if (!Number.isInteger(id) || id < 0) throw new ValidationError("listingId must be a non-negative integer.");
    const client = signerKey ? this.contracts.withSigner(signerKey) : this.contracts;
    const transaction = await client.send("resale", "cancelListing", [id]);
    return { listingId: id, transaction };
  }

  async getResaleListing(listingId) {
    const id = Number(listingId);
    if (!Number.isInteger(id) || id < 0) throw new ValidationError("listingId must be a non-negative integer.");
    const [propertyId, seller, units, pricePerUnit, reservedBy, reservedAt, status] =
      await this.contracts.call("resale", "getListing", [id]);
    const expiresAt = await this.contracts.call("resale", "reservationExpiresAt", [id]);
    return {
      listingId: id,
      propertyId,
      seller,
      units: Number(units),
      pricePerUnit: pricePerUnit.toString(),
      reservedBy: reservedBy === "0x0000000000000000000000000000000000000000" ? null : reservedBy,
      reservedAt: isoFromSeconds(reservedAt),
      reservationExpiresAt: isoFromSeconds(expiresAt),
      status: LISTING_STATUS[Number(status)] ?? "UNKNOWN",
    };
  }

  // =====================================================================
  // 6. Mirror node
  // =====================================================================

  async getTransaction(reference) {
    return this.mirror.getTransaction(reference);
  }

  async getTransactionStatus(reference) {
    const transaction = await this.mirror.getTransaction(reference);
    return {
      reference,
      status: transaction.status,
      success: transaction.success,
      transactionId: transaction.transactionId,
      consensusTimestamp: transaction.consensusTimestamp,
      explorerUrl: transaction.explorerUrl,
    };
  }

  /** Recent on-chain activity for an account, newest first. */
  async getTransactionHistory({ accountId, limit = 25, order = "desc" } = {}) {
    assertTestnet();
    const id = validation.accountId(accountId);
    const transactions = await this.mirror.getAccountTransactions(id, { limit, order });
    return {
      accountId: id,
      network: TESTNET.name,
      count: transactions.length,
      transactions,
      explorerUrl: explorer.account(id),
    };
  }

  /** All explorer links for an entity, so the UI never builds URLs itself. */
  getExplorerLinks({ transactionId, accountId, tokenId, topicId, contractAddress } = {}) {
    const links = {};
    if (transactionId) links.transaction = explorer.transaction(transactionId);
    if (accountId) links.account = explorer.account(accountId);
    if (tokenId) links.token = explorer.token(tokenId);
    if (topicId) links.topic = explorer.topic(topicId);
    if (contractAddress) links.contract = explorer.contract(contractAddress);
    links.network = `${TESTNET.explorerUrl.replace(/\/testnet$/, "")}/testnet`;
    return links;
  }

  // =====================================================================
  // Diagnostics
  // =====================================================================

  async getNetworkInfo() {
    return {
      network: TESTNET.name,
      chainId: TESTNET.chainId,
      mirrorNodeUrl: this.config.mirrorNodeUrl,
      jsonRpcUrl: this.config.jsonRpcUrl,
      explorerUrl: this.config.explorerUrl,
      operator: {
        configured: Boolean(this.config.operatorId && this.config.operatorKey),
        accountId: this.config.operatorId || null,
      },
      topicId: this.consensus.topicId || null,
      contracts: { ...this.config.contracts },
    };
  }

  /** Health probe: mirror node reachability plus configuration completeness. */
  async health() {
    const report = {
      status: "ok",
      network: TESTNET.name,
      mirrorNode: { reachable: false },
      operator: { configured: Boolean(this.config.operatorId && this.config.operatorKey) },
      topic: { configured: Boolean(this.consensus.topicId) },
      contracts: {
        configured: Object.values(this.config.contracts ?? {}).filter(Boolean).length,
        expected: 4,
      },
    };
    try {
      await this.mirror.getExchangeRate();
      report.mirrorNode.reachable = true;
    } catch (error) {
      report.status = "degraded";
      report.mirrorNode.error = error.message;
    }
    if (!report.operator.configured) report.status = "degraded";
    return report;
  }

  /** Compute the exact SHA-256 the contracts anchor for a property payload. */
  hashPropertyPayload(payload) {
    return sha256Hex(payload);
  }

  /**
   * Append to the HCS audit log without failing a confirmed chain write.
   * Never throws: the caller gets `recorded: false` and the reason.
   */
  async #audit(type, propertyId, data, actor) {
    if (!this.consensus.topicId) {
      return {
        recorded: false,
        reason: "HEDERA_PROPERTY_TOPIC_ID is not configured; on-chain transaction is unaffected.",
      };
    }
    try {
      const record = await this.consensus.recordEvent({ type, propertyId, data, actor });
      return {
        recorded: true,
        topicId: record.topicId,
        sequenceNumber: record.sequenceNumber,
        transactionId: record.transactionId,
        explorerUrl: record.explorerUrl,
      };
    } catch (error) {
      return { recorded: false, reason: error.message };
    }
  }
}

let singleton = null;

/** Lazily constructed shared service for the API layer. */
function getBlockchainService() {
  if (!singleton) singleton = new BlockchainService();
  return singleton;
}

module.exports = { BlockchainService, getBlockchainService, LISTING_STATUS, requireContractValue };
