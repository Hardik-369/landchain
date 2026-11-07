/**
 * End-to-end verification against a throwaway data directory.
 *
 *   node scripts/e2e.mjs
 *
 * It boots the real Express app, drives the full investment + resale lifecycle
 * over HTTP and asserts the ownership maths after every step.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";

const dataDir = mkdtempSync(path.join(tmpdir(), "landchain-engine-e2e-"));
process.env.DATA_DIR = dataDir;
process.env.ENGINE_LEDGER_MODE = "local";
process.env.NODE_ENV = "test";

const { seedDemoData, DEMO_PROPERTY_ID } = await import("./seed.mjs");
const { createApp } = await import("../src/app.js");

const results = [];
function ok(label, detail = "") {
  results.push({ label, detail });
  console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
}

function close(actual, expected, tolerance = 0.0001) {
  assert.ok(Math.abs(actual - expected) < tolerance, `expected ${expected}, received ${actual}`);
}

let server;
try {
  await seedDemoData({ silent: true });
  server = createApp().listen(0);
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api/engine`;

  async function api(method, url, { body, userId, role } = {}) {
    const headers = {};
    if (body) headers["content-type"] = "application/json";
    if (userId) headers["x-user-id"] = userId;
    if (role) headers["x-user-role"] = role;
    const response = await fetch(`${base}${url}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: response.status, data };
  }

  console.log("\nInvestment engine end-to-end\n");

  // ---------------------------------------------------------------- health
  const health = await api("GET", "/health");
  assert.equal(health.status, 200);
  assert.equal(health.data.ledger.mode, "local");
  ok("service boots and reports the unanchored ledger mode");

  const runtime = await api("GET", "/config");
  const t = runtime.data.thresholds;
  assert.equal(t.unitValue, 1000);
  assert.equal(t.totalUnits, 5000);
  assert.equal(t.buyer.minUnits, 5);
  assert.equal(t.buyer.minInvestment, 5000);
  assert.equal(t.buyer.maxUnits, 1000);
  assert.equal(t.external.minUnits, 10);
  assert.equal(t.external.minInvestment, 10000);
  assert.equal(t.external.maxUnits, 1250);
  assert.equal(t.investors.minInvestors, 3);
  assert.equal(t.investors.maxInvestors, 50);
  ok("spec thresholds resolve exactly (₹5,000/5 units, 20% cap, 25% external, 3-50 investors)");

  // ------------------------------------------------------- external investors
  const registered = [];
  for (const investor of [
    { name: "Ananya Rao", email: "ananya.rao@example.com", walletAddress: "0x1111111111111111111111111111111111111111" },
    { name: "Vikram Iyer", email: "vikram.iyer@example.com", walletAddress: "0x2222222222222222222222222222222222222222" },
    { name: "Meera Nair", email: "meera.nair@example.com", walletAddress: "0x3333333333333333333333333333333333333333" },
  ]) {
    const res = await api("POST", "/investors", { body: { ...investor, investorType: "external", kycStatus: "verified" } });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    registered.push(res.data);
  }
  assert.equal(new Set(registered.map((entry) => entry.userId)).size, 3);
  const [A, B, C] = registered.map((entry) => entry.userId);
  ok("three external investors registered", A + ", " + B + ", " + C);

  // ------------------------------------------------------------- validation
  const belowMin = await api("POST", "/investments/quote", { userId: A, body: { propertyId: DEMO_PROPERTY_ID, units: 4, investorType: "external" } });
  assert.equal(belowMin.status, 200);
  assert.equal(belowMin.data.eligible, false);
  assert.equal(belowMin.data.checks.find((check) => !check.ok).code, "BELOW_MINIMUM_UNITS");
  ok("investment below the minimum is rejected");

  const quote = await api("POST", "/investments/quote", { userId: A, body: { propertyId: DEMO_PROPERTY_ID, units: 10, investorType: "external" } });
  assert.equal(quote.data.eligible, true);
  assert.equal(quote.data.amount, 10_000);
  close(quote.data.ownershipPercent, 0.2);
  ok("valid investment quotes ₹10,000 for 10 units (0.2%)");

  // -------------------------------------------------------- primary market
  const a100 = await api("POST", "/investments", { userId: A, body: { propertyId: DEMO_PROPERTY_ID, units: 100, investorType: "external" } });
  assert.equal(a100.status, 201, JSON.stringify(a100.data));
  assert.equal(a100.data.status, "confirmed");
  assert.equal(a100.data.amount, 100_000);
  close(a100.data.ownershipPercent, 2);
  assert.equal(a100.data.funding.unitsSold, 100);
  ok("first investment confirmed and supply reduced", "100 units, 2% ownership");

  const overCap = await api("POST", "/investments", { userId: A, body: { propertyId: DEMO_PROPERTY_ID, units: 1200, investorType: "external" } });
  assert.equal(overCap.status, 422);
  assert.equal(overCap.data.code, "CONTRIBUTION_CAP_EXCEEDED");
  ok("contribution cap prevents an investor from exceeding 25% (1250 units)");

  const b20 = await api("POST", "/investments", { userId: B, body: { propertyId: DEMO_PROPERTY_ID, units: 20, investorType: "external" } });
  assert.equal(b20.status, 201, JSON.stringify(b20.data));
  const c10 = await api("POST", "/investments", { userId: C, body: { propertyId: DEMO_PROPERTY_ID, units: 10, investorType: "external" } });
  assert.equal(c10.status, 201, JSON.stringify(c10.data));

  const funding = await api("GET", `/properties/${DEMO_PROPERTY_ID}/funding`);
  assert.equal(funding.data.funding.investorCount, 3);
  assert.equal(funding.data.funding.amountRaised, 130_000);
  assert.equal(funding.data.funding.unitsSold, 130);
  assert.equal(funding.data.funding.amountRemaining, 4_870_000);
  assert.equal(funding.data.funding.state, "funding");
  assert.equal(funding.data.funding.investorMinimumMet, true);
  ok("pooling tracks 3 investors, ₹1,30,000 raised, ₹48,70,000 remaining");

  const ownership = await api("GET", `/properties/${DEMO_PROPERTY_ID}/ownership`);
  assert.equal(ownership.data.holders.length, 3);
  assert.equal(ownership.data.supply.allocatedUnits, 130);
  assert.equal(ownership.data.supply.availableUnits, 4_870);
  const holderA = ownership.data.holders.find((holder) => holder.userId === A);
  assert.equal(holderA.units, 100);
  close(holderA.ownershipPercent, 2);
  assert.equal(holderA.availableToSell, 100);
  ok("fractional ownership percentages and available units are correct");

  // ----------------------------------------------------- resale marketplace
  const listing = await api("POST", "/resale", { userId: A, body: { propertyId: DEMO_PROPERTY_ID, units: 40, pricePerUnit: 1200 } });
  assert.equal(listing.status, 201, JSON.stringify(listing.data));
  assert.equal(listing.data.status, "active");
  assert.equal(listing.data.escrow.status, "escrowed");
  assert.equal(listing.data.escrow.units, 40);
  assert.equal(listing.data.totalValue, 48_000);
  const listingId = listing.data.id;
  ok("investor A lists 40 of 100 units; the units are escrowed");

  const balance = await api("GET", `/resale/available?sellerId=${A}&propertyId=${DEMO_PROPERTY_ID}`);
  assert.equal(balance.data.held, 100);
  assert.equal(balance.data.available, 60);
  ok("escrow prevents spending reserved units", "held 100, available 60");

  const duplicate = await api("POST", "/resale", { userId: A, body: { propertyId: DEMO_PROPERTY_ID, units: 40, pricePerUnit: 1200 } });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.data.code, "CONFLICT");
  ok("duplicate listing is rejected");

  const tooMany = await api("POST", "/resale", { userId: A, body: { propertyId: DEMO_PROPERTY_ID, units: 61, pricePerUnit: 1200 } });
  assert.equal(tooMany.status, 422);
  ok("listing more than the unreserved balance is rejected");

  const unowned = await api("POST", "/resale", { userId: C, body: { propertyId: DEMO_PROPERTY_ID, units: 999, pricePerUnit: 1200 } });
  assert.equal(unowned.status, 422);
  ok("resale of unowned units is rejected");

  // ------------------------------------------------------------ reservation
  const reserved = await api("POST", `/resale/${listingId}/reserve`, { userId: B });
  assert.equal(reserved.status, 200, JSON.stringify(reserved.data));
  assert.equal(reserved.data.reservation.status, "reserved");
  assert.equal(reserved.data.reservation.buyerId, B);
  assert.ok(reserved.data.reservation.expiresAt);
  ok("buyer B reserves the listing for the configured window");

  const blocked = await api("POST", `/resale/${listingId}/buy`, { userId: C });
  assert.equal(blocked.status, 409);
  ok("another investor cannot buy a reserved listing");

  const sold = await api("POST", `/resale/${listingId}/buy`, { userId: B });
  assert.equal(sold.status, 200, JSON.stringify(sold.data));
  assert.equal(sold.data.status, "sold");
  assert.equal(sold.data.amount, 48_000);
  assert.equal(sold.data.sellerWallet, "0x1111111111111111111111111111111111111111");
  assert.equal(sold.data.buyerWallet, "0x2222222222222222222222222222222222222222");
  assert.equal(sold.data.ownership.seller.units, 60);
  close(sold.data.ownership.seller.ownershipPercent, 1.2);
  assert.equal(sold.data.ownership.buyer.units, 60);
  close(sold.data.ownership.buyer.ownershipPercent, 1.2);
  assert.equal(sold.data.ownership.totalUnits, 5000);
  ok("resale transfers 40 units: seller 100→60, buyer 20→60, no new units created");

  const afterSale = await api("GET", `/properties/${DEMO_PROPERTY_ID}/ownership`);
  assert.equal(afterSale.data.supply.allocatedUnits, 130);
  assert.equal(afterSale.data.supply.availableUnits, 4_870);
  assert.equal(afterSale.data.holders.find((holder) => holder.userId === A).units, 60);
  assert.equal(afterSale.data.holders.find((holder) => holder.userId === B).units, 60);
  ok("property supply is unchanged by the resale (no tokens minted)");

  const history = await api("GET", `/resale/history?propertyId=${DEMO_PROPERTY_ID}`);
  assert.equal(history.data.length, 1);
  assert.equal(history.data[0].sellerId, A);
  assert.equal(history.data[0].buyerId, B);
  assert.equal(history.data[0].units, 40);
  assert.equal(history.data[0].pricePerUnit, 1200);
  assert.equal(history.data[0].status, "sold");
  assert.ok(history.data[0].soldAt);
  assert.ok("hederaTransactionId" in history.data[0]);
  ok("resale history records both wallets, units, price, timestamp and Hedera id field");

  const ownershipHistory = await api("GET", `/properties/${DEMO_PROPERTY_ID}/ownership-history`);
  const transfer = ownershipHistory.data.find((record) => record.type === "resale_transfer");
  assert.equal(transfer.fromUserId, A);
  assert.equal(transfer.toUserId, B);
  assert.equal(transfer.units, 40);
  assert.equal(transfer.pricePerUnit, 1200);
  ok("ownership history captures the transfer");

  // ------------------------------------------------------- cancel restores
  const second = await api("POST", "/resale", { userId: A, body: { propertyId: DEMO_PROPERTY_ID, units: 20, pricePerUnit: 1100 } });
  assert.equal(second.status, 201);
  const cancelled = await api("POST", `/resale/${second.data.id}/cancel`, { userId: A });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.status, "cancelled");
  assert.equal(cancelled.data.escrow.status, "released");
  const restored = await api("GET", `/resale/available?sellerId=${A}&propertyId=${DEMO_PROPERTY_ID}`);
  assert.equal(restored.data.available, 60);
  ok("cancelling a listing releases the reservation", "available back to 60");

  // -------------------------------------------------------------- integrity
  const audit = await api("GET", "/audit");
  assert.equal(audit.status, 200, JSON.stringify(audit.data.issues ?? audit.data));
  assert.equal(audit.data.ok, true);
  assert.equal(audit.data.counts.investments, 4);
  assert.equal(audit.data.counts.resaleListings, 2);
  ok("append-only audit reconciles supply, tokens, ownership and profiles");

  const transactions = await api("GET", `/investments?propertyId=${DEMO_PROPERTY_ID}`);
  assert.equal(transactions.data.length, 4);

  console.log(`\n${results.length} checks passed.\n`);
} catch (error) {
  console.error("\nE2E FAILED\n", error);
  process.exitCode = 1;
} finally {
  if (server) server.close();
  rmSync(dataDir, { recursive: true, force: true });
}
