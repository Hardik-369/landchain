/**
 * Primary-market investment engine.
 *
 * Flow (two phases so concurrent requests cannot oversell a property):
 *
 *   1. validate  - thresholds, contribution cap, supply, investor capacity
 *   2. reserve   - a `pending` investment plus property.unitsReserved
 *   3. ledger    - Contributor 3's blockchain service (investment + allocation)
 *   4. confirm   - flip to `confirmed`, move reservation -> unitsSold, append the
 *                  transaction, token and ownership records
 *
 * If the ledger fails the reservation is released and the investment is marked
 * `failed`; no transaction, token or ownership record is written.
 */
import { makeId } from "../../../backend/src/lib/ids.js";
import { findById } from "../../../backend/src/lib/records.js";
import { store } from "../lib/store.js";
import { AppError } from "../lib/errors.js";
import {
  appendOwnershipRecord,
  appendTokenRecord,
  appendTransaction,
  now,
  recomputeUserAggregates,
  upsertInvestorProfile,
} from "../lib/records.js";
import { fundingSnapshot, holdingUnits, toPublicInvestment } from "../lib/portfolio.js";
import { ownershipPercent, resolveRules, thresholdsFor } from "../thresholds.js";
import { resolveInvestorType } from "./investor.service.js";
import { allocateUnits, recordInvestment, tokenIdFor } from "../lib/ledger.js";

const INVESTABLE_STATUSES = ["open", "active"];
const PENDING_TTL_MS = 2 * 60 * 1000;

function check(code, ok, message, status = 422) {
  return { code, ok: Boolean(ok), message: ok ? null : message, status };
}

/**
 * Pure evaluation of one investment against every rule. Shared by the quote
 * endpoint and the write path so the UI and the engine never disagree.
 */
export function evaluateInvestment({
  property,
  investments,
  investors = [],
  platformSettings = {},
  tokenRecords = [],
  userId,
  units,
  investorType,
}) {
  const profile = investors.find((candidate) => candidate.userId === userId) ?? null;
  const type = resolveInvestorType({ investorType, profile });
  const rules = resolveRules(property);
  const limits = thresholdsFor(rules, type);

  const parsedUnits = Number(units);
  const unitsValid = Number.isInteger(parsedUnits) && parsedUnits > 0;
  const existingUnits = holdingUnits(investments, userId, property.id);
  const amount = unitsValid ? parsedUnits * rules.unitValue : 0;

  const unitsSold = Number(property.unitsSold ?? 0);
  const unitsReserved = Number(property.unitsReserved ?? 0);
  const availableUnits = Math.max(0, rules.totalUnits - unitsSold - unitsReserved);

  const propertyInvestors = new Set(
    investments
      .filter(
        (investment) =>
          investment.propertyId === property.id && investment.status === "confirmed",
      )
      .map((investment) => investment.userId),
  );
  const wouldBeNewInvestor = !propertyInvestors.has(userId);
  const investorCount = propertyInvestors.size + (wouldBeNewInvestor ? 1 : 0);
  const wouldCompleteFunding =
    unitsValid && parsedUnits === availableUnits && unitsSold + parsedUnits >= rules.totalUnits;

  const platformMax = Number(platformSettings.maxInvestmentAmount ?? 0);
  const tokenId = tokenIdFor(tokenRecords, property.id) ?? property.hederaTokenId ?? null;

  const checks = [
    check(
      "PROPERTY_NOT_OPEN",
      INVESTABLE_STATUSES.includes(property.status),
      `Property is ${property.status} and is not open for investment.`,
      409,
    ),
    check("INVALID_UNITS", unitsValid, "Units must be a whole number greater than zero."),
    check(
      "BELOW_MINIMUM_UNITS",
      !unitsValid || parsedUnits >= limits.minUnits,
      `Minimum ${type} investment is ${limits.minUnits} units (₹${limits.minInvestment.toLocaleString("en-IN")}).`,
    ),
    check(
      "CONTRIBUTION_CAP_EXCEEDED",
      !unitsValid || existingUnits + parsedUnits <= limits.maxUnits,
      `This investor can hold at most ${limits.maxUnits} units in this property (${limits.maxContributionPercent}% cap). Currently held: ${existingUnits}.`,
    ),
    check(
      "SUPPLY_EXHAUSTED",
      !unitsValid || parsedUnits <= availableUnits,
      availableUnits === 0
        ? "This property is fully funded."
        : `Only ${availableUnits} units are available (${unitsReserved} reserved by pending investments).`,
      409,
    ),
    check(
      "INVESTOR_CAPACITY_FULL",
      !wouldBeNewInvestor || investorCount <= rules.investors.maxInvestors,
      `This property already has the maximum of ${rules.investors.maxInvestors} investors.`,
      409,
    ),
    check(
      "INVESTOR_MINIMUM_NOT_MET",
      !wouldCompleteFunding || investorCount >= rules.investors.minInvestors,
      `At least ${rules.investors.minInvestors} investors are required to close the funding round.`,
    ),
    check(
      "PLATFORM_CAP_EXCEEDED",
      !unitsValid || platformMax <= 0 || amount <= platformMax,
      `A single investment cannot exceed ₹${platformMax.toLocaleString("en-IN")}.`,
    ),
  ];

  return {
    propertyId: property.id,
    userId,
    investorType: type,
    eligible: checks.every((entry) => entry.ok),
    checks,
    units: unitsValid ? parsedUnits : null,
    unitValue: rules.unitValue,
    amount,
    currency: "INR",
    ownershipPercent: unitsValid ? ownershipPercent(parsedUnits, rules.totalUnits) : 0,
    existingUnits,
    resultingUnits: existingUnits + (unitsValid ? parsedUnits : 0),
    maxUnits: limits.maxUnits,
    minUnits: limits.minUnits,
    minInvestment: limits.minInvestment,
    maxInvestment: limits.maxUnits * rules.unitValue,
    availableUnits,
    investorCount,
    rules,
    limits,
    tokenProvisioned: Boolean(tokenId),
  };
}

function throwFromEvaluation(evaluation) {
  const failed = evaluation.checks.find((entry) => !entry.ok);
  if (!failed) return;
  throw new AppError(failed.message, failed.status ?? 422, failed.code, evaluation.checks);
}

async function readInvestmentContext() {
  return store.readMany([
    "properties",
    "investments",
    "investors",
    "users",
    "tokenRecords",
    "platformSettings",
  ]);
}

/** Quote an investment without writing anything. */
export async function quoteInvestment({ propertyId, userId, units, investorType }) {
  if (!userId) throw AppError.unauthorized("An investor is required.");
  const context = await readInvestmentContext();
  const property = findById(context.properties, propertyId, "Property");
  return evaluateInvestment({
    property,
    investments: context.investments,
    investors: context.investors,
    platformSettings: context.platformSettings,
    tokenRecords: context.tokenRecords,
    userId,
    units,
    investorType,
  });
}

/** Release reservations left behind by a crashed or timed-out ledger call. */
export async function releaseStaleReservations() {
  const investments = await store.read("investments");
  const cutoff = Date.now() - PENDING_TTL_MS;
  const stale = investments.filter(
    (investment) =>
      investment.status === "pending" &&
      new Date(investment.reservedAt ?? investment.purchasedAt ?? 0).getTime() < cutoff,
  );
  if (!stale.length) return 0;

  return store.transact(["investments", "properties"], (drafts) => {
    let released = 0;
    for (const snapshot of stale) {
      const investment = drafts.investments.find((candidate) => candidate.id === snapshot.id);
      if (!investment || investment.status !== "pending") continue;
      investment.status = "failed";
      investment.failedAt = now();
      investment.failureReason = "Reservation expired before the ledger confirmed the investment.";
      const property = drafts.properties.find((candidate) => candidate.id === investment.propertyId);
      if (property) {
        property.unitsReserved = Math.max(0, Number(property.unitsReserved ?? 0) - investment.units);
        property.updatedAt = now();
      }
      released += 1;
    }
    return released;
  });
}

/** Step 2: create the `pending` investment and reserve supply. */
async function reserveInvestment({ propertyId, userId, units, investorType }) {
  return store.transact(
    ["properties", "investments", "users", "investors", "tokenRecords", "platformSettings"],
    (drafts) => {
      const property = findById(drafts.properties, propertyId, "Property");
      const evaluation = evaluateInvestment({
        property,
        investments: drafts.investments,
        investors: drafts.investors,
        platformSettings: drafts.platformSettings,
        tokenRecords: drafts.tokenRecords,
        userId,
        units,
        investorType,
      });
      if (!evaluation.eligible) throwFromEvaluation(evaluation);

      const user = drafts.users.find((candidate) => candidate.id === userId);
      const timestamp = now();
      const investment = {
        id: makeId("INV"),
        propertyId: property.id,
        propertyTitle: property.title,
        userId,
        investorName: user?.name ?? "LANDCHAIN investor",
        investorType: evaluation.investorType,
        units: evaluation.units,
        pricePerUnit: evaluation.unitValue,
        amount: evaluation.amount,
        ownershipPercent: evaluation.ownershipPercent,
        purchasedAt: timestamp,
        status: "pending",
        txHash: null,
        source: "primary",
        reservedAt: timestamp,
        createdAt: timestamp,
      };
      drafts.investments.push(investment);

      property.unitsReserved = Number(property.unitsReserved ?? 0) + evaluation.units;
      property.updatedAt = timestamp;

      return { investment, evaluation };
    },
  );
}

async function failReservation(investmentId, error) {
  try {
    await store.transact(["investments", "properties"], (drafts) => {
      const investment = drafts.investments.find((candidate) => candidate.id === investmentId);
      if (!investment || investment.status !== "pending") return;
      investment.status = "failed";
      investment.failedAt = now();
      investment.failureReason = error.message;
      const property = drafts.properties.find((candidate) => candidate.id === investment.propertyId);
      if (property) {
        property.unitsReserved = Math.max(
          0,
          Number(property.unitsReserved ?? 0) - investment.units,
        );
        property.updatedAt = now();
      }
    });
  } catch (cleanupError) {
    console.error("[investment-engine] failed to release reservation", investmentId, cleanupError);
  }
}

/** Step 4: confirm, settle balances and append the immutable records. */
async function confirmInvestment({ investmentId, allocation, pool, tokenId }) {
  return store.transact(
    [
      "properties",
      "investments",
      "transactions",
      "tokenRecords",
      "ownershipHistory",
      "investors",
      "users",
      "platformSettings",
    ],
    (drafts) => {
      const investment = drafts.investments.find((candidate) => candidate.id === investmentId);
      if (!investment) throw AppError.conflict("The pending investment disappeared before confirmation.");
      if (investment.status !== "pending") {
        throw AppError.conflict(`Investment ${investmentId} is ${investment.status}, not pending.`);
      }

      const property = findById(drafts.properties, investment.propertyId, "Property");
      const reserved = Number(property.unitsReserved ?? 0);
      if (reserved < investment.units) {
        throw AppError.conflict("The reserved supply for this investment was released.");
      }
      if (Number(property.unitsSold ?? 0) + investment.units > property.totalUnits) {
        throw AppError.conflict("Confirming this investment would exceed the total unit supply.");
      }

      const rules = resolveRules(property);
      const timestamp = now();
      investment.status = "confirmed";
      investment.purchasedAt = timestamp;
      investment.confirmedAt = timestamp;
      investment.txHash = pool?.transactionHash ?? allocation?.transactionHash ?? null;
      investment.hederaTransactionId = allocation?.transactionId ?? pool?.transactionId ?? null;
      investment.hederaTokenId = tokenId ?? allocation?.tokenId ?? null;
      investment.anchor = { investment: pool ?? null, allocation: allocation ?? null };
      delete investment.reservedAt;

      property.unitsReserved = Math.max(0, reserved - investment.units);
      property.unitsSold = Number(property.unitsSold ?? 0) + investment.units;
      property.updatedAt = timestamp;
      if (property.unitsSold >= property.totalUnits) {
        property.status = "funded";
        property.fundedAt = property.fundedAt ?? timestamp;
      }

      const anchor = pool?.anchored ? pool : allocation;
      const transaction = appendTransaction(drafts, {
        type: "investment",
        description: `${property.title} · ${investment.units} units`,
        amount: -investment.amount,
        userId: investment.userId,
        propertyId: property.id,
        units: investment.units,
        status: "completed",
        reference:
          anchor?.transactionId ??
          anchor?.transactionHash ??
          allocation?.transactionId ??
          makeId("REF"),
        metadata: {
          investmentId: investment.id,
          investorType: investment.investorType,
          ledgerMode: anchor?.mode ?? "local",
          hederaTransactionId: anchor?.transactionId ?? null,
          hederaSequenceNumber: anchor?.sequenceNumber ?? null,
        },
      });

      appendTokenRecord(drafts, {
        propertyId: property.id,
        userId: investment.userId,
        units: investment.units,
        investmentId: investment.id,
        transactionId: transaction.id,
        type: "allocation",
        anchor: allocation,
        tokenId,
      });

      appendOwnershipRecord(drafts, {
        propertyId: property.id,
        units: investment.units,
        toUserId: investment.userId,
        type: "primary_allocation",
        investmentId: investment.id,
        transactionId: transaction.id,
        pricePerUnit: investment.pricePerUnit,
        propertyVersion: property.version ?? null,
        totalUnits: rules.totalUnits,
        anchor,
      });

      upsertInvestorProfile(drafts, investment.userId, { investorType: investment.investorType });
      recomputeUserAggregates(drafts.users, drafts.investments, investment.userId);

      return {
        investment: toPublicInvestment(investment),
        funding: fundingSnapshot(property, drafts.investments, drafts.investors),
      };
    },
  );
}

/** Buy units in the primary market. */
export async function createInvestment({ propertyId, userId, units, investorType }) {
  if (!userId) throw AppError.unauthorized("Sign in to invest.");

  await releaseStaleReservations();

  const { investment, evaluation } = await reserveInvestment({
    propertyId,
    userId,
    units,
    investorType,
  });

  const context = await readInvestmentContext();
  const property = findById(context.properties, propertyId, "Property");
  const tokenId = tokenIdFor(context.tokenRecords, propertyId) ?? property.hederaTokenId ?? null;
  const walletAddress =
    context.users.find((candidate) => candidate.id === userId)?.walletAddress ??
    context.investors.find((candidate) => candidate.userId === userId)?.walletAddress ??
    null;

  let allocation;
  let pool;
  try {
    allocation = await allocateUnits({
      propertyId,
      userId,
      walletAddress,
      units: investment.units,
      tokenId,
    });
    pool = await recordInvestment({
      propertyId,
      userId,
      walletAddress,
      units: investment.units,
      amount: investment.amount,
    });
  } catch (error) {
    await failReservation(investment.id, error);
    if (error.details && !error.details.compensation && allocation?.anchored) {
      error.details.compensation =
        "Units were allocated on Hedera but the funding-pool write failed. Reverse the allocation or retry recordInvestment.";
    }
    throw error;
  }

  try {
    const confirmed = await confirmInvestment({
      investmentId: investment.id,
      allocation,
      pool,
      tokenId,
    });
    return {
      ...confirmed.investment,
      funding: confirmed.funding,
      limits: {
        unitValue: evaluation.unitValue,
        minUnits: evaluation.minUnits,
        maxUnits: evaluation.maxUnits,
        maxInvestment: evaluation.maxInvestment,
      },
    };
  } catch (error) {
    await failReservation(investment.id, error);
    throw error;
  }
}

export async function listInvestments({ userId, propertyId, status } = {}) {
  const investments = await store.read("investments");
  return investments
    .filter((investment) => (userId ? investment.userId === userId : true))
    .filter((investment) => (propertyId ? investment.propertyId === propertyId : true))
    .filter((investment) => (status ? investment.status === status : true))
    .sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime())
    .map(toPublicInvestment);
}

export async function getInvestment(id) {
  const { investments, properties, transactions, tokenRecords, ownershipHistory } =
    await store.readMany([
      "investments",
      "properties",
      "transactions",
      "tokenRecords",
      "ownershipHistory",
    ]);
  const investment = findById(investments, id, "Investment");
  const property = properties.find((candidate) => candidate.id === investment.propertyId);

  return {
    ...toPublicInvestment(investment),
    property: property
      ? { id: property.id, title: property.title, status: property.status, totalUnits: property.totalUnits }
      : null,
    transactions: transactions.filter(
      (transaction) => transaction.metadata?.investmentId === investment.id,
    ),
    tokenRecords: tokenRecords.filter((record) => record.investmentId === investment.id),
    ownership: ownershipHistory.filter((record) => record.investmentId === investment.id),
  };
}
