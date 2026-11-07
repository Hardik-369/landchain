/**
 * Secondary resale marketplace.
 *
 * Units are escrowed when a listing is created, so a seller can never list the
 * same units twice and can never sell units that a live listing has reserved:
 *
 *   held - escrowed(active listings) = available to list
 *
 * A resale moves existing units between investment records - it never creates
 * new tokens and never changes property.unitsSold. Every movement is captured
 * in the shared transactions / tokenRecords / ownershipHistory collections with
 * the real Hedera transaction id when the ledger is configured.
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
import {
  availableListingUnits,
  holdingUnits,
} from "../lib/portfolio.js";
import { ownershipPercent } from "../thresholds.js";
import { config } from "../config.js";
import { completeResale, recordEvent, tokenIdFor, transferUnits } from "../lib/ledger.js";

const ACTIVE = "active";

function walletOf(users, userId) {
  return users.find((candidate) => candidate.id === userId)?.walletAddress ?? null;
}

function expired(listing) {
  return (
    listing.reservationStatus === "reserved" &&
    listing.reservationExpiresAt &&
    Date.parse(listing.reservationExpiresAt) < Date.now()
  );
}

export function toPublicListing(listing) {
  return {
    id: listing.id,
    propertyId: listing.propertyId,
    propertyTitle: listing.propertyTitle,
    city: listing.city ?? null,
    sellerId: listing.sellerId,
    sellerName: listing.sellerName,
    sellerWallet: listing.sellerWallet ?? null,
    buyerId: listing.buyerId ?? null,
    buyerName: listing.buyerName ?? null,
    buyerWallet: listing.buyerWallet ?? null,
    units: listing.units,
    pricePerUnit: listing.pricePerUnit,
    originalPricePerUnit: listing.originalPricePerUnit,
    totalValue: listing.totalValue,
    listedAt: listing.listedAt,
    status: listing.status,
    imageSeed: listing.imageSeed ?? null,
    soldAt: listing.soldAt ?? null,
    cancelledAt: listing.cancelledAt ?? null,
    escrow: {
      status: listing.escrowStatus ?? (listing.status === ACTIVE ? "escrowed" : "released"),
      units: listing.escrowStatus === "escrowed" ? listing.units : 0,
    },
    reservation: {
      status: listing.reservationStatus ?? "none",
      buyerId: listing.reservedBy ?? null,
      reservedAt: listing.reservedAt ?? null,
      expiresAt: listing.reservationExpiresAt ?? null,
      releasedAt: listing.reservationReleasedAt ?? null,
    },
    hederaTransactionId: listing.hederaTransactionId ?? null,
    hederaSequenceNumber: listing.hederaSequenceNumber ?? null,
    anchor: listing.anchor ?? null,
    settlementAnchor: listing.settlementAnchor ?? null,
  };
}

/** Clear buyer reservations whose window has passed. */
export async function expireReservations() {
  const listings = await store.read("resaleListings");
  const stale = listings.filter(expired);
  if (!stale.length) return 0;

  return store.transact(["resaleListings"], (drafts) => {
    let released = 0;
    for (const snapshot of stale) {
      const listing = drafts.resaleListings.find((candidate) => candidate.id === snapshot.id);
      if (!listing || listing.reservationStatus !== "reserved" || !expired(listing)) continue;
      listing.reservationStatus = "expired";
      listing.reservedBy = null;
      listing.reservationReleasedAt = now();
      listing.updatedAt = now();
      released += 1;
    }
    return released;
  });
}

export async function listListings({ status, propertyId, sellerId } = {}) {
  await expireReservations();
  const listings = await store.read("resaleListings");
  return listings
    .filter((listing) => (status && status !== "all" ? listing.status === status : true))
    .filter((listing) => (propertyId ? listing.propertyId === propertyId : true))
    .filter((listing) => (sellerId ? listing.sellerId === sellerId : true))
    .sort((a, b) => new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime())
    .map(toPublicListing);
}

export async function getListing(id) {
  await expireReservations();
  const listings = await store.read("resaleListings");
  return toPublicListing(findById(listings, id, "Resale listing"));
}

/** Seller's listable balance for one property (held minus live escrow). */
export async function availableUnitsForSeller({ sellerId, propertyId }) {
  const { investments, resaleListings } = await store.readMany(["investments", "resaleListings"]);
  return {
    sellerId,
    propertyId,
    held: holdingUnits(investments, sellerId, propertyId),
    available: availableListingUnits(investments, resaleListings, sellerId, propertyId),
  };
}

/** List units for resale. The listed units are escrowed immediately. */
export async function createListing({ propertyId, units, pricePerUnit, sellerId, sellerName }) {
  if (!sellerId) throw AppError.unauthorized("Sign in to list units for resale.");

  const parsedUnits = Number(units);
  const parsedPrice = Number(pricePerUnit);
  if (!Number.isInteger(parsedUnits) || parsedUnits <= 0) {
    throw AppError.unprocessable("Units must be a whole number greater than zero.");
  }
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    throw AppError.unprocessable("Enter a valid asking price per unit.");
  }

  const context = await store.readMany([
    "properties",
    "investments",
    "resaleListings",
    "users",
    "investors",
  ]);
  const property = findById(context.properties, propertyId, "Property");
  const held = holdingUnits(context.investments, sellerId, propertyId);
  const available = availableListingUnits(
    context.investments,
    context.resaleListings,
    sellerId,
    propertyId,
  );

  if (held === 0) {
    throw AppError.unprocessable("You do not own units in this property.");
  }
  if (parsedUnits > available) {
    throw AppError.unprocessable(
      `You can list at most ${available} units. ${held - available} units are already reserved in active listings.`,
    );
  }

  const duplicate = context.resaleListings.find(
    (listing) =>
      listing.status === ACTIVE &&
      listing.sellerId === sellerId &&
      listing.propertyId === propertyId &&
      listing.units === parsedUnits &&
      listing.pricePerUnit === parsedPrice,
  );
  if (duplicate) {
    throw AppError.conflict(
      `An identical active listing already exists (${duplicate.id}). Cancel it before listing again.`,
    );
  }

  const sellerWallet =
    context.investors.find((profile) => profile.userId === sellerId)?.walletAddress ??
    walletOf(context.users, sellerId);

  const anchor = await recordEvent({
    propertyId,
    eventType: "resale_listed",
    data: {
      sellerId,
      sellerWallet,
      units: parsedUnits,
      pricePerUnit: parsedPrice,
      totalValue: parsedUnits * parsedPrice,
    },
    actor: `user:${sellerId}`,
  });

  return store.transact(
    ["resaleListings", "investments", "properties", "users", "investors"],
    (drafts) => {
      const propertyRecord = findById(drafts.properties, propertyId, "Property");
      const heldNow = holdingUnits(drafts.investments, sellerId, propertyId);
      const availableNow = availableListingUnits(
        drafts.investments,
        drafts.resaleListings,
        sellerId,
        propertyId,
      );
      if (parsedUnits > availableNow) {
        throw AppError.conflict(
          `Only ${availableNow} units are still available to list (you hold ${heldNow}).`,
        );
      }

      const seller = drafts.users.find((candidate) => candidate.id === sellerId);
      const timestamp = now();
      const listing = {
        id: makeId("RSL"),
        propertyId: propertyRecord.id,
        propertyTitle: propertyRecord.title,
        city: propertyRecord.city ?? null,
        sellerId,
        sellerName: sellerName ?? seller?.name ?? "LANDCHAIN investor",
        sellerWallet,
        units: parsedUnits,
        pricePerUnit: parsedPrice,
        originalPricePerUnit: propertyRecord.unitPrice,
        totalValue: parsedUnits * parsedPrice,
        listedAt: timestamp,
        status: ACTIVE,
        imageSeed: propertyRecord.imageSeed ?? null,
        soldAt: null,
        buyerId: null,
        // reservation system
        escrowStatus: "escrowed",
        reservedUnits: parsedUnits,
        reservationStatus: "none",
        reservedBy: null,
        reservedAt: null,
        reservationExpiresAt: null,
        hederaTransactionId: anchor.transactionId ?? null,
        hederaSequenceNumber: anchor.sequenceNumber ?? null,
        anchor,
        updatedAt: timestamp,
      };
      drafts.resaleListings.push(listing);
      return toPublicListing(listing);
    },
  );
}

/** Buyer reserves a listing for the reservation window. */
export async function reserveListing(id, buyerId) {
  if (!buyerId) throw AppError.unauthorized("Sign in to reserve a listing.");

  return store.transact(["resaleListings", "investments", "users"], (drafts) => {
    const listing = findById(drafts.resaleListings, id, "Resale listing");
    if (listing.status !== ACTIVE) {
      throw AppError.conflict("This listing is no longer available.");
    }
    if (listing.sellerId === buyerId) {
      throw AppError.conflict("You cannot reserve your own listing.");
    }
    if (expired(listing)) {
      listing.reservationStatus = "expired";
      listing.reservedBy = null;
      listing.reservationReleasedAt = now();
    }
    if (listing.reservationStatus === "reserved" && listing.reservedBy !== buyerId) {
      throw AppError.conflict(
        `This listing is reserved by another investor until ${listing.reservationExpiresAt}.`,
      );
    }

    const held = holdingUnits(drafts.investments, listing.sellerId, listing.propertyId);
    if (held < listing.units) {
      throw AppError.conflict("The seller no longer holds enough units to honour this listing.");
    }

    const timestamp = now();
    const expiresAt = new Date(Date.now() + config.reservationTtlSeconds * 1000).toISOString();
    listing.reservationStatus = "reserved";
    listing.reservedBy = buyerId;
    listing.reservedAt = timestamp;
    listing.reservationExpiresAt = expiresAt;
    listing.reservationReleasedAt = null;
    listing.updatedAt = timestamp;

    return toPublicListing(listing);
  });
}

/** Release a reservation without buying (buyer or seller). */
export async function releaseReservation(id, actor) {
  const actorId = actor?.id;
  if (!actorId) throw AppError.unauthorized("Sign in to release a reservation.");

  return store.transact(["resaleListings"], (drafts) => {
    const listing = findById(drafts.resaleListings, id, "Resale listing");
    if (listing.reservationStatus !== "reserved") {
      throw AppError.conflict("This listing has no active reservation.");
    }
    if (
      actor.role !== "admin" &&
      listing.reservedBy !== actorId &&
      listing.sellerId !== actorId
    ) {
      throw AppError.forbidden("Only the reserver, the seller or an admin can release this reservation.");
    }
    listing.reservationStatus = "released";
    listing.reservedBy = null;
    listing.reservationReleasedAt = now();
    listing.updatedAt = now();
    return toPublicListing(listing);
  });
}

/** Cancel a listing and release its escrowed units back to the seller. */
export async function cancelListing(id, actor) {
  const actorId = actor?.id;
  if (!actorId) throw AppError.unauthorized("Sign in to cancel a listing.");

  const snapshot = await store.read("resaleListings");
  const existing = findById(snapshot, id, "Resale listing");
  if (existing.status !== ACTIVE) {
    throw AppError.conflict("Only active listings can be cancelled.");
  }
  if (actor.role !== "admin" && existing.sellerId !== actorId) {
    throw AppError.forbidden("You can only cancel your own listings.");
  }

  const anchor = await recordEvent({
    propertyId: existing.propertyId,
    eventType: "resale_cancelled",
    data: { listingId: existing.id, sellerId: existing.sellerId, units: existing.units },
    actor: `user:${actorId}`,
  });

  return store.transact(["resaleListings"], (drafts) => {
    const listing = findById(drafts.resaleListings, id, "Resale listing");
    if (listing.status !== ACTIVE) {
      throw AppError.conflict("Only active listings can be cancelled.");
    }
    const timestamp = now();
    listing.status = "cancelled";
    listing.cancelledAt = timestamp;
    listing.updatedAt = timestamp;
    listing.escrowStatus = "released";
    listing.reservedUnits = 0;
    listing.reservationStatus = "none";
    listing.reservedBy = null;
    listing.cancellationAnchor = anchor;
    return toPublicListing(listing);
  });
}

/** Mark a listing that can no longer be honoured as cancelled (release escrow). */
async function failListing(listingId, reason) {
  try {
    await store.transact(["resaleListings"], (drafts) => {
      const listing = drafts.resaleListings.find((candidate) => candidate.id === listingId);
      if (!listing || listing.status !== ACTIVE) return;
      listing.status = "cancelled";
      listing.cancelledAt = now();
      listing.updatedAt = now();
      listing.escrowStatus = "released";
      listing.reservedUnits = 0;
      listing.reservationStatus = "none";
      listing.reservedBy = null;
      listing.cancellationReason = reason;
    });
  } catch (error) {
    console.error("[investment-engine] failed to release resale escrow", listingId, error);
  }
}

function splitSellerUnits(drafts, listing, property) {
  let remaining = listing.units;
  const sellerPositions = drafts.investments
    .filter(
      (investment) =>
        investment.userId === listing.sellerId &&
        investment.propertyId === listing.propertyId &&
        investment.status === "confirmed" &&
        investment.units > 0,
    )
    .sort((a, b) => new Date(a.purchasedAt).getTime() - new Date(b.purchasedAt).getTime());

  for (const position of sellerPositions) {
    if (remaining === 0) break;
    const take = Math.min(position.units, remaining);
    position.units -= take;
    position.amount = position.units * position.pricePerUnit;
    position.ownershipPercent = ownershipPercent(position.units, property.totalUnits);
    position.updatedAt = now();
    remaining -= take;
  }
  if (remaining > 0) {
    throw AppError.conflict("The seller's holdings could not be split for this sale.");
  }
}

/** Buy a listing: transfer existing units, no new tokens are created. */
export async function buyListing(id, buyerId) {
  if (!buyerId) throw AppError.unauthorized("Sign in to purchase a resale listing.");

  await expireReservations();

  const context = await store.readMany([
    "resaleListings",
    "investments",
    "properties",
    "users",
    "investors",
    "tokenRecords",
  ]);
  const listing = findById(context.resaleListings, id, "Resale listing");
  if (listing.status !== ACTIVE) throw AppError.conflict("This listing is no longer available.");
  if (listing.sellerId === buyerId) throw AppError.conflict("You cannot buy your own listing.");
  if (
    listing.reservationStatus === "reserved" &&
    listing.reservedBy &&
    listing.reservedBy !== buyerId
  ) {
    throw AppError.conflict(
      `This listing is reserved by another investor until ${listing.reservationExpiresAt}.`,
    );
  }

  const property = findById(context.properties, listing.propertyId, "Property");
  const held = holdingUnits(context.investments, listing.sellerId, listing.propertyId);
  if (held < listing.units) {
    await failListing(
      listing.id,
      "Seller no longer holds enough units; escrow released so the seller can relist.",
    );
    throw AppError.conflict("The seller no longer holds enough units to complete this sale.");
  }

  const tokenId = tokenIdFor(context.tokenRecords, listing.propertyId) ?? property.hederaTokenId ?? null;
  const sellerWallet =
    context.investors.find((profile) => profile.userId === listing.sellerId)?.walletAddress ??
    listing.sellerWallet ??
    walletOf(context.users, listing.sellerId);
  const buyerWallet =
    context.investors.find((profile) => profile.userId === buyerId)?.walletAddress ??
    walletOf(context.users, buyerId);
  const buyer = context.users.find((candidate) => candidate.id === buyerId);

  let transfer = null;
  let settlement = null;
  if (Number.isInteger(listing.hederaListingId)) {
    settlement = await completeResale({ listingId: listing.hederaListingId, propertyId: listing.propertyId });
  }
  transfer = await transferUnits({
    propertyId: listing.propertyId,
    tokenId,
    fromUserId: listing.sellerId,
    toUserId: buyerId,
    fromWallet: sellerWallet,
    toWallet: buyerWallet,
    units: listing.units,
  });
  let auditWarning = null;
  let event = null;
  try {
    event = await recordEvent({
      propertyId: listing.propertyId,
      eventType: "resale_completed",
      data: {
        listingId: listing.id,
        sellerId: listing.sellerId,
        buyerId,
        units: listing.units,
        pricePerUnit: listing.pricePerUnit,
        totalValue: listing.totalValue,
        hederaTransactionId: transfer?.transactionId ?? settlement?.transactionId ?? null,
      },
      actor: `user:${buyerId}`,
    });
  } catch (error) {
    // Units may already have moved on-chain; do not lose the settlement because
    // the audit topic write failed.
    auditWarning = error.message;
    event = {
      mode: "local",
      anchored: false,
      status: "not_anchored",
      reason: error.message,
      transactionId: null,
      transactionHash: null,
      sequenceNumber: null,
    };
  }
  const anchor = transfer?.anchored ? transfer : settlement?.anchored ? settlement : event;

  try {
    return await store.transact(
      [
        "resaleListings",
        "properties",
        "investments",
        "transactions",
        "tokenRecords",
        "ownershipHistory",
        "investors",
        "users",
      ],
      (drafts) => {
        const liveListing = findById(drafts.resaleListings, id, "Resale listing");
        if (liveListing.status !== ACTIVE) {
          throw AppError.conflict("This listing is no longer available.");
        }
        const liveProperty = findById(drafts.properties, liveListing.propertyId, "Property");
        const heldNow = holdingUnits(drafts.investments, liveListing.sellerId, liveListing.propertyId);
        if (heldNow < liveListing.units) {
          throw AppError.conflict("The seller no longer holds enough units to complete this sale.");
        }

        const timestamp = now();
        const amount = liveListing.units * liveListing.pricePerUnit;

        // 1. remove units from the seller (FIFO across their positions)
        splitSellerUnits(drafts, liveListing, liveProperty);

        // 2. give the exact same units to the buyer - no new tokens
        const purchase = {
          id: makeId("INV"),
          propertyId: liveProperty.id,
          propertyTitle: liveProperty.title,
          userId: buyerId,
          investorName: buyer?.name ?? "LANDCHAIN investor",
          investorType:
            drafts.investors.find((profile) => profile.userId === buyerId)?.investorType ?? "buyer",
          units: liveListing.units,
          pricePerUnit: liveListing.pricePerUnit,
          amount,
          ownershipPercent: ownershipPercent(liveListing.units, liveProperty.totalUnits),
          purchasedAt: timestamp,
          status: "confirmed",
          txHash: anchor?.transactionHash ?? null,
          hederaTransactionId: anchor?.transactionId ?? null,
          source: "resale",
          listingId: liveListing.id,
          anchor,
          createdAt: timestamp,
        };
        drafts.investments.push(purchase);

        const buyerTransaction = appendTransaction(drafts, {
          type: "resale_purchase",
          description: `${liveProperty.title} · ${liveListing.units} units (resale from ${liveListing.sellerName})`,
          amount: -amount,
          userId: buyerId,
          propertyId: liveProperty.id,
          units: liveListing.units,
          status: "completed",
          reference: anchor?.transactionId ?? anchor?.transactionHash ?? makeId("REF"),
          metadata: {
            listingId: liveListing.id,
            counterpartyId: liveListing.sellerId,
            investmentId: purchase.id,
            ledgerMode: anchor?.mode ?? "local",
          },
        });

        const sellerTransaction = appendTransaction(drafts, {
          type: "resale_sale",
          description: `${liveProperty.title} · ${liveListing.units} units sold`,
          amount,
          userId: liveListing.sellerId,
          propertyId: liveProperty.id,
          units: liveListing.units,
          status: "completed",
          reference: anchor?.transactionId ?? anchor?.transactionHash ?? makeId("REF"),
          metadata: {
            listingId: liveListing.id,
            counterpartyId: buyerId,
            ledgerMode: anchor?.mode ?? "local",
          },
        });

        appendTokenRecord(drafts, {
          propertyId: liveProperty.id,
          userId: buyerId,
          fromUserId: liveListing.sellerId,
          units: liveListing.units,
          investmentId: purchase.id,
          transactionId: buyerTransaction.id,
          type: "transfer",
          anchor: transfer,
          tokenId,
        });

        appendOwnershipRecord(drafts, {
          propertyId: liveProperty.id,
          units: liveListing.units,
          fromUserId: liveListing.sellerId,
          toUserId: buyerId,
          type: "resale_transfer",
          investmentId: purchase.id,
          transactionId: buyerTransaction.id,
          pricePerUnit: liveListing.pricePerUnit,
          propertyVersion: liveProperty.version ?? null,
          totalUnits: liveProperty.totalUnits,
          anchor,
        });

        for (const userId of [liveListing.sellerId, buyerId]) {
          upsertInvestorProfile(drafts, userId);
          recomputeUserAggregates(drafts.users, drafts.investments, userId);
        }

        liveListing.status = "sold";
        liveListing.soldAt = timestamp;
        liveListing.updatedAt = timestamp;
        liveListing.buyerId = buyerId;
        liveListing.buyerName = buyer?.name ?? "LANDCHAIN investor";
        liveListing.buyerWallet = buyerWallet;
        liveListing.sellerWallet = sellerWallet;
        liveListing.escrowStatus = "settled";
        liveListing.reservedUnits = 0;
        liveListing.reservationStatus = "consumed";
        liveListing.reservedBy = null;
        liveListing.hederaTransactionId = anchor?.transactionId ?? null;
        liveListing.hederaSequenceNumber = anchor?.sequenceNumber ?? null;
        liveListing.buyerTransactionId = buyerTransaction.id;
        liveListing.sellerTransactionId = sellerTransaction.id;
        liveListing.settlementAnchor = anchor;
        liveListing.txHash = anchor?.transactionHash ?? null;

        return {
          ...toPublicListing(liveListing),
          amount,
          auditWarning,
          ownership: {
            seller: {
              userId: liveListing.sellerId,
              units: holdingUnits(drafts.investments, liveListing.sellerId, liveProperty.id),
              ownershipPercent: ownershipPercent(
                holdingUnits(drafts.investments, liveListing.sellerId, liveProperty.id),
                liveProperty.totalUnits,
              ),
            },
            buyer: {
              userId: buyerId,
              units: holdingUnits(drafts.investments, buyerId, liveProperty.id),
              ownershipPercent: ownershipPercent(
                holdingUnits(drafts.investments, buyerId, liveProperty.id),
                liveProperty.totalUnits,
              ),
            },
            totalUnits: liveProperty.totalUnits,
          },
          transactions: {
            buyer: buyerTransaction.id,
            seller: sellerTransaction.id,
          },
        };
      },
    );
  } catch (error) {
    if (transfer?.anchored) {
      error.details = {
        ...(error.details ?? {}),
        compensation:
          "Units were transferred on Hedera but the JSON settlement failed. Run the reverse transferUnits() call or retry the purchase.",
      };
    }
    if (/no longer holds/.test(error.message ?? "")) {
      await failListing(
        listing.id,
        `Seller no longer holds enough units; escrow released (${error.message}).`,
      );
    }
    throw error;
  }
}

/** Resale history with both wallets and the Hedera transaction id. */
export async function resaleHistory({ propertyId, userId, status } = {}) {
  const listings = await store.read("resaleListings");
  return listings
    .filter((listing) => (propertyId ? listing.propertyId === propertyId : true))
    .filter((listing) =>
      userId ? listing.sellerId === userId || listing.buyerId === userId : true,
    )
    .filter((listing) => (status ? listing.status === status : true))
    .sort((a, b) => new Date(b.soldAt ?? b.listedAt).getTime() - new Date(a.soldAt ?? a.listedAt).getTime())
    .map((listing) => ({
      listingId: listing.id,
      propertyId: listing.propertyId,
      propertyTitle: listing.propertyTitle,
      sellerId: listing.sellerId,
      sellerWallet: listing.sellerWallet ?? null,
      buyerId: listing.buyerId ?? null,
      buyerWallet: listing.buyerWallet ?? null,
      units: listing.units,
      pricePerUnit: listing.pricePerUnit,
      totalValue: listing.totalValue,
      status: listing.status,
      listedAt: listing.listedAt,
      soldAt: listing.soldAt ?? null,
      hederaTransactionId: listing.hederaTransactionId ?? null,
      hederaSequenceNumber: listing.hederaSequenceNumber ?? null,
    }));
}

export async function resaleStats() {
  const { resaleListings: listings } = await store.readMany(["resaleListings"]);
  const active = listings.filter((listing) => listing.status === ACTIVE);
  const sold = listings.filter((listing) => listing.status === "sold");
  return {
    totalListings: listings.length,
    activeListings: active.length,
    soldListings: sold.length,
    cancelledListings: listings.filter((listing) => listing.status === "cancelled").length,
    reservedListings: active.filter((listing) => listing.reservationStatus === "reserved").length,
    activeValue: active.reduce((sum, listing) => sum + listing.totalValue, 0),
    soldValue: sold.reduce((sum, listing) => sum + listing.totalValue, 0),
    unitsSold: sold.reduce((sum, listing) => sum + listing.units, 0),
    averageResalePremium:
      sold.length === 0
        ? 0
        : Number(
            (
              sold.reduce(
                (sum, listing) =>
                  sum +
                  ((listing.pricePerUnit - listing.originalPricePerUnit) /
                    (listing.originalPricePerUnit || 1)) *
                    100,
                0,
              ) / sold.length
            ).toFixed(2),
          ),
  };
}
