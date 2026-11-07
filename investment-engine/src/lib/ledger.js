/**
 * Blockchain adapter (Contributor 3's service).
 *
 * Rules this file enforces:
 *  - the engine never invents a transaction id; every id it stores comes from a
 *    Hedera receipt or an HCS consensus record;
 *  - when the ledger is not configured the write is reported as `not_anchored`
 *    with the reason, never faked;
 *  - `ENGINE_LEDGER_MODE=live` turns a missing configuration into a hard error.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { config } from "../config.js";
import { AppError } from "./errors.js";

const BLOCKCHAIN_ENTRY = path.join(config.repoRoot, "blockchain", "src", "index.js");

function paymentReference(seed) {
  return `0x${createHash("sha256").update(String(seed), "utf8").digest("hex")}`;
}

function localAnchor(reason, extra = {}) {
  return {
    mode: "local",
    anchored: false,
    status: "not_anchored",
    reason,
    transactionId: null,
    transactionHash: null,
    sequenceNumber: null,
    explorerUrl: null,
    network: null,
    recordedAt: new Date().toISOString(),
    ...extra,
  };
}

function liveAnchor(result, extra = {}) {
  return {
    mode: "live",
    anchored: true,
    status: "settled",
    reason: null,
    transactionId: result?.transactionId ?? null,
    transactionHash: result?.transactionHash ?? null,
    sequenceNumber: result?.sequenceNumber ?? null,
    explorerUrl: result?.explorerUrl ?? null,
    network: "Hedera Testnet",
    recordedAt: new Date().toISOString(),
    ...extra,
  };
}

function ledgerFailure(action, error) {
  return new AppError(
    `Hedera ${action} failed: ${error.message}`,
    502,
    "LEDGER_FAILED",
    { action, cause: error.code ?? null },
  );
}

let cached = null;

async function loadBlockchain() {
  const module = await import(pathToFileURL(BLOCKCHAIN_ENTRY).href);
  return module.default ?? module;
}

export async function getLedger(force = false) {
  if (cached && !force) return cached;
  cached = await createLedger();
  return cached;
}

async function createLedger() {
  if (config.ledgerMode === "local") {
    return {
      mode: "local",
      reason: "ENGINE_LEDGER_MODE=local",
      service: null,
      info: {
        mode: "local",
        network: null,
        reason: "ENGINE_LEDGER_MODE=local",
        tokenMovements: false,
      },
    };
  }

  let api;
  try {
    api = await loadBlockchain();
  } catch (error) {
    if (config.ledgerMode === "live") {
      throw new AppError(
        `ENGINE_LEDGER_MODE=live but the blockchain module could not be loaded: ${error.message}`,
        503,
        "LEDGER_UNAVAILABLE",
      );
    }
    return {
      mode: "local",
      reason: `blockchain module unavailable (${error.message})`,
      service: null,
      info: {
        mode: "local",
        network: null,
        reason: `blockchain module unavailable (${error.message})`,
        tokenMovements: false,
      },
    };
  }

  const contracts = api.config?.contracts ?? {};
  const configuredContracts = Object.values(contracts).filter(Boolean).length;
  const hasOperator = Boolean(api.hasOperatorCredentials?.());
  const ready = hasOperator && configuredContracts === 4;

  if (!ready) {
    const reason = hasOperator
      ? `Hedera contract addresses are incomplete (${configuredContracts}/4 configured)`
      : "Hedera operator credentials are not configured";
    if (config.ledgerMode === "live") {
      throw new AppError(
        `ENGINE_LEDGER_MODE=live but ${reason}. Set HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY and the four contract addresses in blockchain/.env.`,
        503,
        "LEDGER_NOT_CONFIGURED",
      );
    }
    return {
      mode: "local",
      reason,
      service: null,
      info: { mode: "local", network: null, reason, tokenMovements: false },
    };
  }

  const service = api.getBlockchainService();
  return {
    mode: "live",
    reason: null,
    service,
    info: {
      mode: "live",
      network: "Hedera Testnet",
      operator: api.config.operatorId,
      topicConfigured: Boolean(api.config.topicId),
      contracts,
      tokenMovements: true,
    },
  };
}

/** Public status for /health, with the raw node report when live. */
export async function ledgerStatus() {
  const ledger = await getLedger();
  if (ledger.mode !== "live") {
    return { ...ledger.info, configured: false, reachable: false };
  }
  let health = null;
  try {
    health = await ledger.service.health();
  } catch (error) {
    health = { status: "degraded", error: error.message };
  }
  return {
    ...ledger.info,
    configured: true,
    reachable: health?.mirrorNode?.reachable ?? false,
    health,
  };
}

/** The token id previously allocated for a property (tokenRecords). */
export function tokenIdFor(tokenRecords, propertyId) {
  const records = tokenRecords
    .filter((record) => record.propertyId === propertyId && record.hederaTokenId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return records[0]?.hederaTokenId ?? null;
}

async function requireLive() {
  const ledger = await getLedger();
  if (ledger.mode !== "live") return { ledger, error: ledger.reason };
  return { ledger, error: null };
}

/** Record a settled investment against the on-chain funding pool. */
export async function recordInvestment({ propertyId, userId, walletAddress, units, amount }) {
  const { ledger, error } = await requireLive();
  if (error) return localAnchor(error);
  if (!walletAddress) {
    if (config.ledgerMode === "live") {
      throw new AppError(
        "The investor needs a Hedera wallet address before the investment can be recorded on-chain.",
        422,
        "WALLET_REQUIRED",
      );
    }
    return localAnchor("investor has no Hedera wallet address");
  }

  const ref = paymentReference(`investment|${propertyId}|${userId}|${units}|${Date.now()}`);
  try {
    const result = await ledger.service.recordInvestment({
      propertyId,
      investorAccountId: walletAddress,
      units,
      amount,
      paymentRef: ref,
      actor: `user:${userId}`,
    });
    return liveAnchor(
      {
        transactionId: result.transaction?.transactionId ?? null,
        transactionHash: result.transaction?.transactionHash ?? null,
        sequenceNumber: result.audit?.sequenceNumber ?? null,
        explorerUrl: result.transaction?.explorerUrl ?? null,
      },
      { paymentRef: ref, funding: result.funding ?? null },
    );
  } catch (cause) {
    throw ledgerFailure("investment recording", cause);
  }
}

/** Mint/allocate the property units to the investor's Hedera account. */
export async function allocateUnits({ propertyId, userId, walletAddress, units, tokenId }) {
  const { ledger, error } = await requireLive();
  if (error) return localAnchor(error);
  if (!tokenId) {
    if (config.ledgerMode === "live") {
      throw new AppError(
        `No Hedera token id is recorded for ${propertyId}. Provision the property token before allocating units.`,
        409,
        "TOKEN_NOT_PROVISIONED",
      );
    }
    return localAnchor("property token not provisioned");
  }
  if (!walletAddress) {
    if (config.ledgerMode === "live") {
      throw new AppError(
        "The investor needs a Hedera wallet address before units can be allocated on-chain.",
        422,
        "WALLET_REQUIRED",
      );
    }
    return localAnchor("investor has no Hedera wallet address");
  }

  try {
    const result = await ledger.service.allocateUnits({
      propertyId,
      tokenId,
      investorAccountId: walletAddress,
      units,
      actor: `user:${userId}`,
      metadata: { source: "investment-engine" },
    });
    return liveAnchor(
      {
        transactionId: result.htsTransaction?.transactionId ?? null,
        transactionHash: result.allocationTransaction?.transactionHash ?? null,
        sequenceNumber: result.audit?.sequenceNumber ?? null,
        explorerUrl: result.htsTransaction?.explorerUrl ?? result.allocationTransaction?.explorerUrl ?? null,
      },
      { tokenId, balance: result.balance ?? null },
    );
  } catch (cause) {
    throw ledgerFailure("token allocation", cause);
  }
}

/** Move existing units between two investors (resale settlement). */
export async function transferUnits({
  propertyId,
  tokenId,
  fromUserId,
  toUserId,
  fromWallet,
  toWallet,
  units,
}) {
  const { ledger, error } = await requireLive();
  if (error) return localAnchor(error);
  if (!config.ledgerTransferOnResale) {
    return localAnchor(
      "HTS unit transfers on resale are disabled (ENGINE_LEDGER_TRANSFER_ON_RESALE=false); the resale contract escrow settles the position.",
    );
  }
  if (!tokenId || !fromWallet || !toWallet) {
    if (config.ledgerMode === "live") {
      throw new AppError(
        "Resale settlement needs a token id and both investor wallet addresses.",
        422,
        "LEDGER_DETAILS_MISSING",
      );
    }
    return localAnchor("token id or wallet addresses are missing");
  }

  try {
    const result = await ledger.service.transferUnits({
      propertyId,
      tokenId,
      fromAccountId: fromWallet,
      toAccountId: toWallet,
      units,
      signerKey: config.ledgerSignerKey || undefined,
      actor: `resale:${fromUserId}->${toUserId}`,
      metadata: { source: "investment-engine" },
    });
    return liveAnchor(
      {
        transactionId: result.htsTransaction?.transactionId ?? null,
        transactionHash: result.ledgerTransaction?.transactionHash ?? null,
        sequenceNumber: result.audit?.sequenceNumber ?? null,
        explorerUrl: result.htsTransaction?.explorerUrl ?? result.ledgerTransaction?.explorerUrl ?? null,
      },
      { tokenId, fromBalance: result.fromBalance ?? null, toBalance: result.toBalance ?? null },
    );
  } catch (cause) {
    throw ledgerFailure("unit transfer", cause);
  }
}

/** Append a resale / ownership event to the HCS audit topic. */
export async function recordEvent({ propertyId, eventType, data = {}, actor }) {
  const { ledger, error } = await requireLive();
  if (error) return localAnchor(error);
  if (!ledger.info.topicConfigured) {
    return localAnchor("HEDERA_PROPERTY_TOPIC_ID is not configured; event was not anchored.");
  }
  try {
    const result = await ledger.service.recordPropertyEvent({
      propertyId,
      eventType,
      data,
      actor,
    });
    return liveAnchor(
      {
        transactionId: result.transactionId ?? null,
        sequenceNumber: result.sequenceNumber ?? null,
        explorerUrl: result.explorerUrl ?? null,
      },
      { eventType },
    );
  } catch (cause) {
    throw ledgerFailure(`event recording (${eventType})`, cause);
  }
}

/** Settle an escrowed resale listing on the ResaleContract (operator-only). */
export async function completeResale({ listingId, propertyId }) {
  const { ledger, error } = await requireLive();
  if (error) return localAnchor(error);
  if (!Number.isInteger(Number(listingId))) {
    return localAnchor("listing has no on-chain listing id");
  }
  try {
    const ref = paymentReference(`resale|${listingId}|${Date.now()}`);
    const result = await ledger.service.completeResale({
      listingId: Number(listingId),
      paymentRef: ref,
      actor: "investment-engine",
    });
    return liveAnchor(
      {
        transactionId: result.transaction?.transactionId ?? null,
        transactionHash: result.transaction?.transactionHash ?? null,
        sequenceNumber: result.audit?.sequenceNumber ?? null,
        explorerUrl: result.transaction?.explorerUrl ?? null,
      },
      { propertyId, paymentRef: ref, onChainListing: result.listing ?? null },
    );
  } catch (cause) {
    throw ledgerFailure("resale settlement", cause);
  }
}
