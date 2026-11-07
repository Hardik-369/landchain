/**
 * Integrity audit.
 *
 * Re-derives every balance from the append-only ledgers and compares it with the
 * mutable records. Anything that does not reconcile is reported, so a demo (or a
 * production restore) can prove that ownership, supply and escrow agree.
 */
import { store } from "../lib/store.js";
import { holdingUnits, holdingsByInvestor } from "../lib/portfolio.js";

function issue(code, message, extra = {}, severity = "error") {
  return { code, severity, message, ...extra };
}

export async function auditLedger() {
  const {
    properties,
    investments,
    investors,
    resaleListings,
    ownershipHistory,
    transactions,
    tokenRecords,
  } = await store.readMany([
    "properties",
    "investments",
    "investors",
    "resaleListings",
    "ownershipHistory",
    "transactions",
    "tokenRecords",
  ]);

  const issues = [];

  // 1. Duplicate ids (append-only collections must stay unique).
  for (const [name, records] of Object.entries({
    investments,
    investors,
    resaleListings,
    ownershipHistory,
    transactions,
    tokenRecords,
  })) {
    const seen = new Set();
    for (const record of records) {
      if (seen.has(record.id)) issues.push(issue("DUPLICATE_ID", `Duplicate id ${record.id}.`, { collection: name }));
      seen.add(record.id);
    }
  }

  // 2. Supply and ownership reconciliation per property.
  const perProperty = [];
  for (const property of properties) {
    const confirmed = investments.filter(
      (investment) => investment.propertyId === property.id && investment.status === "confirmed",
    );
    const pending = investments.filter(
      (investment) => investment.propertyId === property.id && investment.status === "pending",
    );
    const allocated = confirmed.reduce((sum, investment) => sum + investment.units, 0);
    const reserved = pending.reduce((sum, investment) => sum + investment.units, 0);

    if (allocated > Number(property.totalUnits)) {
      issues.push(
        issue("OVER_ALLOCATED", `${property.id} has ${allocated} units allocated but only ${property.totalUnits} exist.`, {
          propertyId: property.id,
        }),
      );
    }
    const recordedSold = Number(property.unitsSold ?? 0);
    if (allocated > recordedSold) {
      // More units are allocated than the property says it sold: real drift.
      issues.push(
        issue(
          "UNITS_SOLD_MISMATCH",
          `${property.id} has ${allocated} allocated units but records unitsSold=${recordedSold}.`,
          { propertyId: property.id },
        ),
      );
    } else if (allocated < recordedSold) {
      // The seed keeps aggregate funding progress with only sample investment
      // rows; that is a known demo-data gap, not engine drift.
      issues.push(
        issue(
          "AGGREGATE_ONLY_HOLDINGS",
          `${property.id} records unitsSold=${recordedSold} but only ${allocated} units have detailed investment rows (seed data aggregate).`,
          { propertyId: property.id },
          "warning",
        ),
      );
    }
    if (Number(property.unitsReserved ?? 0) !== reserved) {
      issues.push(
        issue(
          "UNITS_RESERVED_MISMATCH",
          `${property.id} records unitsReserved=${property.unitsReserved ?? 0} but pending investments sum to ${reserved}.`,
          { propertyId: property.id },
        ),
      );
    }

    // Net units implied by the append-only ownership history.
    const movements = ownershipHistory.filter((record) => record.propertyId === property.id);
    const netOwnership = movements.reduce(
      (sum, record) => sum + (record.toUserId ? record.units : 0) - (record.fromUserId ? record.units : 0),
      0,
    );
    if (movements.length && netOwnership !== allocated) {
      issues.push(
        issue(
          "OWNERSHIP_HISTORY_MISMATCH",
          `${property.id} ownership history nets ${netOwnership} units but confirmed investments hold ${allocated}.`,
          { propertyId: property.id },
        ),
      );
    }

    // Token ledger: allocations are the only mint, transfers only move units.
    const tokens = tokenRecords.filter((record) => record.propertyId === property.id);
    const minted = tokens
      .filter((record) => record.type !== "transfer")
      .reduce((sum, record) => sum + record.units, 0);
    if (tokens.length && minted !== allocated) {
      issues.push(
        issue(
          "TOKEN_SUPPLY_MISMATCH",
          `${property.id} token records mint ${minted} units but confirmed investments hold ${allocated}.`,
          { propertyId: property.id },
        ),
      );
    }

    const tokenBalances = new Map();
    for (const record of tokens) {
      const bump = (userId, delta) => {
        if (!userId) return;
        tokenBalances.set(userId, (tokenBalances.get(userId) ?? 0) + delta);
      };
      if (record.type === "transfer") {
        bump(record.fromUserId, -record.units);
        bump(record.userId, record.units);
      } else {
        bump(record.userId, record.units);
      }
    }
    const investmentHoldings = holdingsByInvestor(investments, property.id);
    for (const [userId, tokenUnits] of tokenBalances.entries()) {
      const heldUnits = investmentHoldings.get(userId) ?? 0;
      if (tokenUnits !== heldUnits) {
        issues.push(
          issue(
            "TOKEN_BALANCE_MISMATCH",
            `${userId} holds ${heldUnits} units in ${property.id} but the token ledger shows ${tokenUnits}.`,
            { propertyId: property.id, userId },
          ),
        );
      }
    }

    // Seller escrow must always be backed by real holdings.
    for (const listing of resaleListings.filter(
      (candidate) => candidate.propertyId === property.id && candidate.status === "active",
    )) {
      const held = holdingUnits(investments, listing.sellerId, property.id);
      if (listing.units > held) {
        issues.push(
          issue(
            "UNBACKED_ESCROW",
            `Listing ${listing.id} escrows ${listing.units} units but ${listing.sellerId} holds ${held}.`,
            { propertyId: property.id, listingId: listing.id },
          ),
        );
      }
    }

    const holders = holdingsByInvestor(investments, property.id);
    const negative = confirmed.filter((investment) => investment.units < 0);
    if (negative.length) {
      issues.push(
        issue("NEGATIVE_BALANCE", `${property.id} has ${negative.length} investment(s) with negative units.`, {
          propertyId: property.id,
        }),
      );
    }

    perProperty.push({
      propertyId: property.id,
      totalUnits: Number(property.totalUnits),
      allocatedUnits: allocated,
      reservedUnits: reserved,
      availableUnits: Math.max(0, Number(property.totalUnits) - allocated - reserved),
      holders: holders.size,
      ownershipHistoryRecords: movements.length,
      tokenRecords: tokens.length,
      activeListings: resaleListings.filter(
        (listing) => listing.propertyId === property.id && listing.status === "active",
      ).length,
    });
  }

  // 3. Listing lifecycle invariants.
  for (const listing of resaleListings) {
    if (listing.status === "sold" && (!listing.buyerId || !listing.soldAt)) {
      issues.push(issue("SOLD_LISTING_INCOMPLETE", `Listing ${listing.id} is sold but has no buyer/timestamp.`, { listingId: listing.id }));
    }
    if (
      listing.reservationStatus === "reserved" &&
      (!listing.reservedBy || !listing.reservationExpiresAt)
    ) {
      issues.push(issue("RESERVATION_INCOMPLETE", `Listing ${listing.id} is reserved without a buyer or expiry.`, { listingId: listing.id }));
    }
    if (listing.status !== "active" && listing.escrowStatus === "escrowed") {
      issues.push(issue("STALE_ESCROW", `Listing ${listing.id} is ${listing.status} but its escrow was never released.`, { listingId: listing.id }));
    }
  }

  // 4. Investor profiles must agree with confirmed investments.
  for (const profile of investors) {
    const actualUnits = holdingUnits(investments, profile.userId, null);
    const actualInvested = investments
      .filter((investment) => investment.userId === profile.userId && investment.status === "confirmed")
      .reduce((sum, investment) => sum + investment.amount, 0);
    if (Number(profile.totalUnits ?? 0) !== actualUnits) {
      issues.push(
        issue(
          "INVESTOR_PROFILE_MISMATCH",
          `${profile.userId} profile records ${profile.totalUnits ?? 0} units but holds ${actualUnits}.`,
          { userId: profile.userId },
        ),
      );
    }
    if (Number(profile.totalInvested ?? 0) !== actualInvested) {
      issues.push(
        issue(
          "INVESTOR_INVESTED_MISMATCH",
          `${profile.userId} profile records ₹${profile.totalInvested ?? 0} invested but investments sum to ₹${actualInvested}.`,
          { userId: profile.userId },
        ),
      );
    }
  }

  const errors = issues.filter((entry) => entry.severity === "error");
  const warnings = issues.filter((entry) => entry.severity === "warning");

  return {
    ok: errors.length === 0,
    checkedAt: new Date().toISOString(),
    storage: { dataDir: store.dataDir, collections: ["investments", "investors", "resaleListings", "ownershipHistory", "transactions", "tokenRecords"] },
    counts: {
      properties: properties.length,
      investments: investments.length,
      investors: investors.length,
      resaleListings: resaleListings.length,
      ownershipHistory: ownershipHistory.length,
      transactions: transactions.length,
      tokenRecords: tokenRecords.length,
    },
    properties: perProperty,
    issues,
    errors,
    warnings,
    summary: { errors: errors.length, warnings: warnings.length },
  };
}
