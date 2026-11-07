/**
 * Investment threshold rules.
 *
 * The defaults come straight from the LANDCHAIN specification:
 *
 *   Property valuation            ₹50,00,000
 *   Total units                   5,000
 *   Unit value                    ₹1,000
 *   Minimum buyer investment      ₹5,000  (5 units)
 *   Maximum buyer contribution    20% of total units
 *
 *   External investor minimum     ₹10,000 (10 units)
 *   External investor maximum     25% of the funding target
 *   Minimum / maximum investors   3 / 50
 *
 * Per-property values always win over the defaults: a property's own
 * `totalValue`, `unitPrice`, `totalUnits` and `minInvestment` are respected, and
 * an optional `investmentRules` object on the property can tighten or relax the
 * percentage caps without touching any other contributor's module.
 */
export const DEFAULT_INVESTMENT_RULES = Object.freeze({
  valuation: 5_000_000,
  totalUnits: 5_000,
  unitValue: 1_000,
  minBuyerUnits: 5,
  minBuyerInvestment: 5_000,
  maxBuyerContributionPercent: 20,
  external: Object.freeze({
    minUnits: 10,
    minInvestment: 10_000,
    maxContributionPercent: 25,
    minInvestors: 3,
    maxInvestors: 50,
  }),
});

export const INVESTOR_TYPES = Object.freeze(["buyer", "external"]);

const isPositive = (value) => Number.isFinite(value) && value > 0;

function positiveInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function clampPercent(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(100, parsed);
}

/** Resolve the complete, effective rule set for one property. */
export function resolveRules(property) {
  if (!property) throw new Error("resolveRules requires a property record.");

  const totalUnits = positiveInt(property.totalUnits) ?? DEFAULT_INVESTMENT_RULES.totalUnits;
  const declaredValue = Number(property.totalValue);
  const declaredUnit = Number(property.unitPrice);
  const unitValue =
    isPositive(declaredUnit)
      ? declaredUnit
      : isPositive(declaredValue)
        ? Math.round(declaredValue / totalUnits)
        : DEFAULT_INVESTMENT_RULES.unitValue;
  const valuation = isPositive(declaredValue) ? declaredValue : totalUnits * unitValue;

  const overrides = property.investmentRules && typeof property.investmentRules === "object"
    ? property.investmentRules
    : {};
  const externalOverrides = overrides.external && typeof overrides.external === "object"
    ? overrides.external
    : {};

  const propertyMinInvestment = isPositive(Number(property.minInvestment))
    ? Number(property.minInvestment)
    : 0;

  const buyerPercent = clampPercent(
    overrides.maxBuyerContributionPercent,
    DEFAULT_INVESTMENT_RULES.maxBuyerContributionPercent,
  );
  const externalPercent = clampPercent(
    externalOverrides.maxContributionPercent,
    DEFAULT_INVESTMENT_RULES.external.maxContributionPercent,
  );

  const minBuyerUnits = Math.max(
    1,
    positiveInt(overrides.minBuyerUnits) ?? DEFAULT_INVESTMENT_RULES.minBuyerUnits,
    propertyMinInvestment > 0 ? Math.ceil(propertyMinInvestment / unitValue) : 1,
  );
  const minBuyerInvestment = Math.max(
    DEFAULT_INVESTMENT_RULES.minBuyerInvestment,
    minBuyerUnits * unitValue,
  );

  const externalMinUnits = Math.max(
    1,
    positiveInt(externalOverrides.minUnits) ?? DEFAULT_INVESTMENT_RULES.external.minUnits,
    Math.ceil(DEFAULT_INVESTMENT_RULES.external.minInvestment / unitValue),
  );
  const externalMinInvestment = Math.max(
    DEFAULT_INVESTMENT_RULES.external.minInvestment,
    externalMinUnits * unitValue,
  );

  const maxBuyerUnits = Math.max(1, Math.floor((totalUnits * buyerPercent) / 100));
  const maxExternalUnits = Math.max(
    1,
    Math.floor((valuation * externalPercent) / 100 / unitValue),
  );

  const minInvestors =
    positiveInt(externalOverrides.minInvestors) ?? DEFAULT_INVESTMENT_RULES.external.minInvestors;
  const maxInvestors =
    positiveInt(externalOverrides.maxInvestors) ?? DEFAULT_INVESTMENT_RULES.external.maxInvestors;

  return {
    propertyId: property.id,
    valuation,
    totalUnits,
    unitValue,
    fundingTarget: valuation,
    buyer: {
      minUnits: minBuyerUnits,
      minInvestment: minBuyerInvestment,
      maxUnits: maxBuyerUnits,
      maxInvestment: maxBuyerUnits * unitValue,
      maxContributionPercent: buyerPercent,
    },
    external: {
      minUnits: externalMinUnits,
      minInvestment: externalMinInvestment,
      maxUnits: maxExternalUnits,
      maxInvestment: maxExternalUnits * unitValue,
      maxContributionPercent: externalPercent,
    },
    investors: { minInvestors, maxInvestors },
    // A property whose own caps make the minimum unreachable cannot be invested in.
    investable: minBuyerUnits <= maxBuyerUnits,
    defaults: DEFAULT_INVESTMENT_RULES,
  };
}

/** Thresholds that apply to one investor type. */
export function thresholdsFor(rules, investorType = "buyer") {
  if (investorType === "external") return rules.external;
  if (investorType === "buyer") return rules.buyer;
  throw new Error(`Unknown investor type "${investorType}".`);
}

/** Ownership percentage for a unit count: (units / totalUnits) * 100. */
export function ownershipPercent(units, totalUnits) {
  if (!totalUnits) return 0;
  return Number(((Number(units) / Number(totalUnits)) * 100).toFixed(4));
}
