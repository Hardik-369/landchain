/**
 * Record shapes shared by every engine service.
 *
 * These mirror Contributor 2's backend records field-for-field so the existing
 * REST API, admin screens and portfolio views read engine-written data without
 * any translation layer.
 */
import { makeId } from "../../../backend/src/lib/ids.js";
import { TRANSACTION_STATUSES, TRANSACTION_TYPES } from "../../../backend/src/lib/constants.js";
import { AppError } from "./errors.js";
import { ownershipPercent } from "../thresholds.js";

export const now = () => new Date().toISOString();

export function appendTransaction(
  drafts,
  {
    type,
    description,
    amount,
    userId = null,
    propertyId = null,
    units = null,
    status = "completed",
    reference,
    metadata,
    date = now(),
  },
) {
  if (!TRANSACTION_TYPES.includes(type)) {
    throw AppError.unprocessable(`Transaction type must be one of: ${TRANSACTION_TYPES.join(", ")}.`);
  }
  if (!TRANSACTION_STATUSES.includes(status)) {
    throw AppError.unprocessable(`Transaction status must be one of: ${TRANSACTION_STATUSES.join(", ")}.`);
  }

  const record = {
    id: makeId("TXN"),
    type,
    description,
    amount,
    userId,
    propertyId,
    units,
    date,
    status,
    reference: reference ?? makeId("REF"),
    metadata,
    createdAt: now(),
  };
  drafts.transactions.push(record);
  return record;
}

export function appendTokenRecord(
  drafts,
  {
    propertyId,
    userId,
    fromUserId = null,
    units,
    investmentId = null,
    transactionId = null,
    type,
    anchor = null,
    tokenId = null,
  },
) {
  const record = {
    id: makeId("TOK"),
    propertyId,
    userId,
    fromUserId,
    units,
    investmentId,
    transactionId,
    type,
    tokenSymbol: drafts.platformSettings?.tokenSymbol ?? "LANDT",
    status: anchor?.anchored ? "settled" : "recorded",
    hederaTokenId: tokenId ?? anchor?.tokenId ?? null,
    hederaTransactionId: anchor?.transactionId ?? null,
    hederaSequenceNumber: anchor?.sequenceNumber ?? null,
    anchor: anchor ?? undefined,
    createdAt: now(),
  };
  drafts.tokenRecords.push(record);
  return record;
}

export function appendOwnershipRecord(
  drafts,
  {
    propertyId,
    units,
    fromUserId = null,
    toUserId,
    type,
    investmentId = null,
    transactionId = null,
    pricePerUnit = null,
    propertyVersion = null,
    anchor = null,
    totalUnits = null,
  },
) {
  const record = {
    id: makeId("OWN"),
    propertyId,
    type,
    units,
    fromUserId,
    toUserId,
    investmentId,
    transactionId,
    pricePerUnit,
    ownershipPercent:
      totalUnits === null ? null : ownershipPercent(units, totalUnits),
    propertyVersion,
    hederaTransactionId: anchor?.transactionId ?? null,
    hederaSequenceNumber: anchor?.sequenceNumber ?? null,
    createdAt: now(),
  };
  drafts.ownershipHistory.push(record);
  return record;
}

/** Rebuild one investor profile from confirmed investments. */
export function upsertInvestorProfile(drafts, userId, { investorType } = {}) {
  const user = drafts.users.find((candidate) => candidate.id === userId);
  const confirmed = drafts.investments.filter(
    (investment) => investment.userId === userId && investment.status === "confirmed",
  );

  let profile = drafts.investors.find((candidate) => candidate.userId === userId);
  if (!profile) {
    profile = {
      id: makeId("INVSTR"),
      userId,
      name: user?.name ?? "LANDCHAIN investor",
      email: user?.email ?? null,
      kycStatus: user?.kycStatus ?? "not_started",
      investorType: investorType ?? "buyer",
      status: "active",
      holdings: [],
      totalInvested: 0,
      totalUnits: 0,
      propertiesCount: 0,
      createdAt: now(),
    };
    drafts.investors.push(profile);
  }

  const byProperty = new Map();
  for (const investment of confirmed) {
    const entry = byProperty.get(investment.propertyId) ?? {
      propertyId: investment.propertyId,
      units: 0,
      invested: 0,
    };
    entry.units += investment.units;
    entry.invested += investment.amount;
    byProperty.set(investment.propertyId, entry);
  }

  profile.name = user?.name ?? profile.name;
  profile.email = user?.email ?? profile.email ?? null;
  profile.kycStatus = user?.kycStatus ?? profile.kycStatus;
  if (investorType) profile.investorType = investorType;
  profile.holdings = [...byProperty.values()].map((entry) => {
    const property = drafts.properties.find((candidate) => candidate.id === entry.propertyId);
    return {
      propertyId: entry.propertyId,
      title: property?.title ?? entry.propertyId,
      units: entry.units,
      invested: entry.invested,
      ownershipPercent: property?.totalUnits ? ownershipPercent(entry.units, property.totalUnits) : 0,
    };
  });
  profile.totalInvested = confirmed.reduce((sum, investment) => sum + investment.amount, 0);
  profile.totalUnits = confirmed.reduce((sum, investment) => sum + investment.units, 0);
  profile.propertiesCount = byProperty.size;
  profile.updatedAt = now();

  return profile;
}

/** Keep the headline user aggregates Contributor 2 exposes in sync. */
export function recomputeUserAggregates(users, investments, userId) {
  const user = users.find((candidate) => candidate.id === userId);
  if (!user) return null;
  const confirmed = investments.filter(
    (investment) => investment.userId === userId && investment.status === "confirmed",
  );
  user.propertiesOwned = new Set(confirmed.map((investment) => investment.propertyId)).size;
  user.totalInvested = confirmed.reduce((sum, investment) => sum + investment.amount, 0);
  return user;
}
