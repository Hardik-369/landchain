/**
 * Fractional ownership projections.
 *
 * Ownership percentage = (investor units / total units) x 100, computed from the
 * confirmed investments so balances always agree with `investments.json`.
 */
import { findById } from "../../../backend/src/lib/records.js";
import { store } from "../lib/store.js";
import {
  availableListingUnits,
  fundingSnapshot,
  holdingUnits,
  holdingsByInvestor,
  supplySnapshot,
} from "../lib/portfolio.js";
import { ownershipPercent, resolveRules } from "../thresholds.js";

function nameFor(investors, investments, userId) {
  return (
    investors.find((profile) => profile.userId === userId)?.name ??
    investments.find((investment) => investment.userId === userId)?.investorName ??
    userId
  );
}

/** Every holder of a property, with units, percentage and listable balance. */
export async function propertyOwnership(propertyId) {
  const { properties, investments, resaleListings, investors } = await store.readMany([
    "properties",
    "investments",
    "resaleListings",
    "investors",
  ]);
  const property = findById(properties, propertyId, "Property");
  const rules = resolveRules(property);
  const supply = supplySnapshot(property, investments);

  const holders = holdingsByInvestor(investments, propertyId);
  const records = [...holders.entries()]
    .map(([userId, units]) => {
      const theirInvestments = investments.filter(
        (investment) =>
          investment.userId === userId &&
          investment.propertyId === propertyId &&
          investment.status === "confirmed",
      );
      const active = resaleListings.filter(
        (listing) =>
          listing.status === "active" &&
          listing.sellerId === userId &&
          listing.propertyId === propertyId,
      );
      return {
        userId,
        name: nameFor(investors, investments, userId),
        units,
        ownershipPercent: ownershipPercent(units, rules.totalUnits),
        invested: theirInvestments.reduce((sum, investment) => sum + investment.amount, 0),
        availableToSell: availableListingUnits(investments, resaleListings, userId, propertyId),
        escrowedUnits: active.reduce((sum, listing) => sum + listing.units, 0),
        activeListings: active.length,
      };
    })
    .sort((a, b) => b.units - a.units);

  return {
    property: {
      id: property.id,
      title: property.title,
      status: property.status,
      unitValue: rules.unitValue,
      totalValue: rules.valuation,
    },
    supply: {
      totalUnits: supply.totalUnits,
      allocatedUnits: supply.allocatedUnits,
      availableUnits: supply.availableUnits,
      allocatedPercent: supply.allocatedPercent,
      reservedUnits: Number(property.unitsReserved ?? 0),
      oversubscribed: supply.oversubscribed,
    },
    funding: fundingSnapshot(property, investments, investors),
    holders: records,
    holderCount: records.length,
  };
}

/** Units and ownership percentages across every property for one investor. */
export async function investorHoldings(userId) {
  const { properties, investments, resaleListings } = await store.readMany([
    "properties",
    "investments",
    "resaleListings",
  ]);

  return properties
    .map((property) => {
      const units = holdingUnits(investments, userId, property.id);
      if (units === 0) return null;
      const rules = resolveRules(property);
      return {
        propertyId: property.id,
        propertyTitle: property.title,
        city: property.city ?? null,
        status: property.status,
        unitValue: rules.unitValue,
        units,
        ownershipPercent: ownershipPercent(units, rules.totalUnits),
        invested: investments
          .filter(
            (investment) =>
              investment.userId === userId &&
              investment.propertyId === property.id &&
              investment.status === "confirmed",
          )
          .reduce((sum, investment) => sum + investment.amount, 0),
        availableToSell: availableListingUnits(investments, resaleListings, userId, property.id),
      };
    })
    .filter(Boolean);
}

/** Append-only ownership movements, newest first. */
export async function ownershipHistory({ propertyId, userId, limit } = {}) {
  const records = await store.read("ownershipHistory");
  const filtered = records
    .filter((record) => (propertyId ? record.propertyId === propertyId : true))
    .filter((record) =>
      userId ? record.toUserId === userId || record.fromUserId === userId : true,
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return typeof limit === "number" ? filtered.slice(0, limit) : filtered;
}
