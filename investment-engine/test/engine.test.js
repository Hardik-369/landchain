import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dataDir = mkdtempSync(path.join(tmpdir(), "landchain-engine-test-"));
process.env.DATA_DIR = dataDir;
process.env.ENGINE_LEDGER_MODE = "local";
process.env.NODE_ENV = "test";

const { resolveRules, ownershipPercent, DEFAULT_INVESTMENT_RULES } = await import("../src/thresholds.js");
const { evaluateInvestment } = await import("../src/services/investment.service.js");
const { createInvestment } = await import("../src/services/investment.service.js");
const { seedDemoData, DEMO_PROPERTY_ID } = await import("../scripts/seed.mjs");
const { createListing, buyListing, reserveListing, releaseReservation, listListings } = await import(
  "../src/services/resale.service.js"
);
const { propertyOwnership } = await import("../src/services/ownership.service.js");
const { auditLedger } = await import("../src/services/audit.service.js");
const { holdingsByInvestor } = await import("../src/lib/portfolio.js");
const { store } = await import("../src/lib/store.js");

const DEMO_PROPERTY = {
  id: "LAND-2026-999",
  title: "Test property",
  totalValue: 5_000_000,
  totalUnits: 5_000,
  unitPrice: 1_000,
  minInvestment: 5_000,
  status: "open",
  unitsSold: 0,
};

test.after(() => rmSync(dataDir, { recursive: true, force: true }));

test("default thresholds match the specification", () => {
  const rules = resolveRules(DEMO_PROPERTY);
  assert.equal(rules.valuation, 5_000_000);
  assert.equal(rules.totalUnits, 5_000);
  assert.equal(rules.unitValue, 1_000);
  assert.equal(rules.buyer.minUnits, DEFAULT_INVESTMENT_RULES.minBuyerUnits);
  assert.equal(rules.buyer.minInvestment, 5_000);
  assert.equal(rules.buyer.maxUnits, 1_000); // 20%
  assert.equal(rules.external.minUnits, 10);
  assert.equal(rules.external.minInvestment, 10_000);
  assert.equal(rules.external.maxUnits, 1_250); // 25% of the funding target
  assert.equal(rules.investors.minInvestors, 3);
  assert.equal(rules.investors.maxInvestors, 50);
});

test("ownership percentage uses units / total units", () => {
  assert.equal(ownershipPercent(100, 5_000), 2);
  assert.equal(ownershipPercent(40, 5_000), 0.8);
  assert.equal(ownershipPercent(0, 5_000), 0);
  assert.equal(ownershipPercent(5, 0), 0);
});

test("evaluation rejects below-minimum, over-cap and over-supply requests", () => {
  const base = {
    property: DEMO_PROPERTY,
    investments: [],
    investors: [{ userId: "ext-1", investorType: "external" }],
    platformSettings: {},
    tokenRecords: [],
    userId: "ext-1",
    investorType: "external",
  };

  assert.equal(evaluateInvestment({ ...base, units: 9 }).eligible, false);
  const belowMinimum = evaluateInvestment({ ...base, units: 9 });
  assert.equal(belowMinimum.checks.find((check) => !check.ok).code, "BELOW_MINIMUM_UNITS");

  const tooMany = evaluateInvestment({ ...base, units: 1_251 });
  assert.equal(tooMany.eligible, false);
  assert.equal(tooMany.checks.find((check) => !check.ok).code, "CONTRIBUTION_CAP_EXCEEDED");

  const nearlySoldOut = evaluateInvestment({
    ...base,
    property: { ...DEMO_PROPERTY, unitsSold: 4_995 },
    units: 10,
  });
  assert.equal(nearlySoldOut.eligible, false);
  assert.equal(nearlySoldOut.checks.find((check) => !check.ok).code, "SUPPLY_EXHAUSTED");

  const cappedInvestors = evaluateInvestment({
    ...base,
    investments: Array.from({ length: 50 }).map((_, index) => ({
      id: `INV-${index}`,
      userId: `existing-${index}`,
      propertyId: DEMO_PROPERTY.id,
      units: 1,
      amount: 1_000,
      status: "confirmed",
    })),
    units: 10,
  });
  assert.equal(cappedInvestors.eligible, false);
  assert.equal(cappedInvestors.checks.find((check) => !check.ok).code, "INVESTOR_CAPACITY_FULL");

  assert.equal(evaluateInvestment({ ...base, units: 10 }).eligible, true);
});

test("full lifecycle: invest, escrow, reserve, resell without minting", async () => {
  const { investors } = await seedDemoData({ silent: true });
  const [a, b] = investors;

  const first = await createInvestment({
    propertyId: DEMO_PROPERTY_ID,
    userId: a,
    units: 100,
    investorType: "external",
  });
  assert.equal(first.status, "confirmed");
  assert.equal(first.ownershipPercent, 2);

  const second = await createInvestment({
    propertyId: DEMO_PROPERTY_ID,
    userId: b,
    units: 20,
    investorType: "external",
  });
  assert.equal(second.status, "confirmed");

  const listing = await createListing({
    propertyId: DEMO_PROPERTY_ID,
    units: 40,
    pricePerUnit: 1_200,
    sellerId: a,
  });
  assert.equal(listing.escrow.units, 40);

  // Listing the same units again must fail because they are escrowed.
  await assert.rejects(
    createListing({ propertyId: DEMO_PROPERTY_ID, units: 61, pricePerUnit: 1_200, sellerId: a }),
    /at most 60 units/,
  );

  const reservation = await reserveListing(listing.id, b);
  assert.equal(reservation.reservation.buyerId, b);

  const released = await releaseReservation(listing.id, { id: b, role: "investor" });
  assert.equal(released.reservation.status, "released");

  const sale = await buyListing(listing.id, b);
  assert.equal(sale.status, "sold");
  assert.equal(sale.ownership.seller.units, 60);
  assert.equal(sale.ownership.buyer.units, 60);

  const ownership = await propertyOwnership(DEMO_PROPERTY_ID);
  assert.equal(ownership.supply.totalUnits, 5_000);
  assert.equal(ownership.supply.allocatedUnits, 120); // unchanged by the resale
  assert.equal(ownership.holders.find((holder) => holder.userId === a).units, 60);

  const investments = await store.read("investments");
  assert.equal(holdingsByInvestor(investments, DEMO_PROPERTY_ID).get(a), 60);

  const tokens = await store.read("tokenRecords");
  const minted = tokens
    .filter((record) => record.propertyId === DEMO_PROPERTY_ID && record.type !== "transfer")
    .reduce((sum, record) => sum + record.units, 0);
  assert.equal(minted, 120, "resale must not mint tokens");
  const transfers = tokens.filter((record) => record.propertyId === DEMO_PROPERTY_ID && record.type === "transfer");
  assert.equal(transfers.length, 1);
  assert.equal(transfers[0].fromUserId, a);
  assert.equal(transfers[0].units, 40);

  const history = await store.read("ownershipHistory");
  const movement = history.find((record) => record.type === "resale_transfer");
  assert.equal(movement.fromUserId, a);
  assert.equal(movement.toUserId, b);
  assert.equal(movement.ownershipPercent, 0.8);

  const audit = await auditLedger();
  assert.equal(audit.ok, true, JSON.stringify(audit.issues));
});
