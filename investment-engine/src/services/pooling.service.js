/**
 * Investment pooling: how much of a property's funding target has been
 * collected, from how many investors, and whether the round can close.
 */
import { findById } from "../../../backend/src/lib/records.js";
import { store } from "../lib/store.js";
import { fundingSnapshot } from "../lib/portfolio.js";
import { resolveRules } from "../thresholds.js";

export async function listPooledProperties({ status } = {}) {
  const { properties, investments, investors } = await store.readMany([
    "properties",
    "investments",
    "investors",
  ]);

  return properties
    .filter((property) => (status ? property.status === status : true))
    .map((property) => {
      const rules = resolveRules(property);
      return {
        property: {
          id: property.id,
          title: property.title,
          city: property.city ?? null,
          category: property.category ?? null,
          status: property.status,
          totalValue: rules.valuation,
          unitPrice: rules.unitValue,
          totalUnits: rules.totalUnits,
        },
        thresholds: {
          unitValue: rules.unitValue,
          buyer: rules.buyer,
          external: rules.external,
          investors: rules.investors,
        },
        funding: fundingSnapshot(property, investments, investors),
      };
    });
}

export async function propertyFunding(propertyId) {
  const { properties, investments, investors } = await store.readMany([
    "properties",
    "investments",
    "investors",
  ]);
  const property = findById(properties, propertyId, "Property");
  const rules = resolveRules(property);

  return {
    property: {
      id: property.id,
      title: property.title,
      status: property.status,
      totalValue: rules.valuation,
      unitPrice: rules.unitValue,
      totalUnits: rules.totalUnits,
    },
    rules,
    funding: fundingSnapshot(property, investments, investors),
  };
}

/** Effective default thresholds, for docs and UI pre-fill. */
export function defaultThresholds() {
  const property = {
    id: "default",
    totalValue: 5_000_000,
    totalUnits: 5_000,
    unitPrice: 1_000,
    minInvestment: 5_000,
  };
  return resolveRules(property);
}
