/**
 * Read-only projections over the JSON records: unit balances, supply and
 * funding progress. Everything is derived from Contributor 2's collections so
 * there is exactly one source of truth.
 */
import { resolveRules, ownershipPercent } from "../thresholds.js";

export function confirmedInvestments(investments, propertyId) {
  return investments.filter(
    (investment) =>
      investment.status === "confirmed" &&
      (propertyId ? investment.propertyId === propertyId : true),
  );
}

/** Units one investor currently holds in a property. */
export function holdingUnits(investments, userId, propertyId) {
  return confirmedInvestments(investments, propertyId)
    .filter((investment) => investment.userId === userId)
    .reduce((sum, investment) => sum + investment.units, 0);
}

/** userId -> units held in a property. */
export function holdingsByInvestor(investments, propertyId) {
  const map = new Map();
  for (const investment of confirmedInvestments(investments, propertyId)) {
    map.set(investment.userId, (map.get(investment.userId) ?? 0) + investment.units);
  }
  return map;
}

/** Units locked in active (escrowed) resale listings. */
export function escrowedUnits(listings, sellerId, propertyId) {
  return listings
    .filter(
      (listing) =>
        listing.status === "active" &&
        listing.sellerId === sellerId &&
        (propertyId ? listing.propertyId === propertyId : true),
    )
    .reduce((sum, listing) => sum + listing.units, 0);
}

/** Units the seller can still list without double-spending the position. */
export function availableListingUnits(investments, listings, sellerId, propertyId) {
  return Math.max(
    0,
    holdingUnits(investments, sellerId, propertyId) - escrowedUnits(listings, sellerId, propertyId),
  );
}

/** Total allocated units for a property (from confirmed investments). */
export function allocatedUnits(investments, propertyId) {
  return confirmedInvestments(investments, propertyId).reduce(
    (sum, investment) => sum + investment.units,
    0,
  );
}

/** Supply view: total, allocated, available, and the funding percentage. */
export function supplySnapshot(property, investments) {
  const rules = resolveRules(property);
  const allocated = allocatedUnits(investments, property.id);
  const totalUnits = rules.totalUnits;
  const clamped = Math.min(allocated, totalUnits);
  return {
    propertyId: property.id,
    totalUnits,
    allocatedUnits: clamped,
    availableUnits: Math.max(0, totalUnits - clamped),
    allocatedPercent: ownershipPercent(clamped, totalUnits),
    oversubscribed: allocated > totalUnits,
    recordedUnitsSold: Number(property.unitsSold ?? 0),
  };
}

/**
 * Funding / pooling view for one property.
 *
 * `state` is the business state of the pool:
 *   funding            - still raising
 *   awaiting_investors - units/amount target reached but fewer than the minimum
 *                        number of investors have participated
 *   funded             - target reached and the investor minimum is met
 */
export function fundingSnapshot(property, investments, investors = []) {
  const rules = resolveRules(property);
  const confirmed = confirmedInvestments(investments, property.id);
  const supply = supplySnapshot(property, investments);

  const raised = confirmed.reduce((sum, investment) => sum + investment.amount, 0);
  const holders = new Map();
  for (const investment of confirmed) {
    const entry = holders.get(investment.userId) ?? { units: 0, invested: 0 };
    entry.units += investment.units;
    entry.invested += investment.amount;
    holders.set(investment.userId, entry);
  }

  const investorCount = holders.size;
  const target = rules.fundingTarget;
  const fundingPercent = target > 0 ? Number(((raised / target) * 100).toFixed(2)) : 0;
  const targetReached = raised >= target || supply.availableUnits === 0;
  const investorMinimumMet = investorCount >= rules.investors.minInvestors;

  let state = "funding";
  if (targetReached) state = investorMinimumMet ? "funded" : "awaiting_investors";

  return {
    propertyId: property.id,
    targetAmount: target,
    amountRaised: raised,
    amountRemaining: Math.max(0, target - raised),
    fundingPercent: Math.min(100, fundingPercent),
    totalUnits: supply.totalUnits,
    unitsSold: supply.allocatedUnits,
    unitsRemaining: supply.availableUnits,
    unitFundingPercent: ownershipPercent(supply.allocatedUnits, supply.totalUnits),
    investorCount,
    minInvestors: rules.investors.minInvestors,
    maxInvestors: rules.investors.maxInvestors,
    investorMinimumMet,
    investorCapacityRemaining: Math.max(0, rules.investors.maxInvestors - investorCount),
    externalInvestorCount: confirmed.filter((investment) => investment.investorType === "external").length,
    averageInvestment: investorCount ? Math.round(raised / investorCount) : 0,
    targetReached,
    state,
    funded: state === "funded",
    unitValue: rules.unitValue,
    currency: "INR",
    investorNames: [...holders.keys()].map(
      (userId) =>
        investors.find((profile) => profile.userId === userId)?.name ??
        confirmed.find((investment) => investment.userId === userId)?.investorName ??
        userId,
    ),
  };
}

export function toPublicInvestment(investment) {
  return {
    id: investment.id,
    propertyId: investment.propertyId,
    propertyTitle: investment.propertyTitle,
    userId: investment.userId,
    investorName: investment.investorName,
    investorType: investment.investorType ?? "buyer",
    units: investment.units,
    pricePerUnit: investment.pricePerUnit,
    amount: investment.amount,
    ownershipPercent: investment.ownershipPercent,
    purchasedAt: investment.purchasedAt,
    status: investment.status,
    txHash: investment.txHash ?? null,
    source: investment.source ?? "primary",
    listingId: investment.listingId ?? undefined,
    anchor: investment.anchor ?? null,
  };
}
