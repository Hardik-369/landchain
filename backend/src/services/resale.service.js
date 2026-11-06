import { store } from "../lib/store.js";
import { AppError } from "../lib/errors.js";
import { makeId } from "../lib/ids.js";
import { pseudoTxHash } from "../lib/hash.js";
import { findProperty, findResaleListing } from "../lib/records.js";
import { recomputeUserAggregates } from "./user.service.js";
import { appendTokenRecord, appendTransaction } from "./transaction.service.js";
import { appendOwnershipRecord, holdingUnits, upsertInvestorProfile } from "./investment.service.js";

function now() {
  return new Date().toISOString();
}

export function toPublicListing(listing) {
  return {
    id: listing.id,
    propertyId: listing.propertyId,
    propertyTitle: listing.propertyTitle,
    city: listing.city,
    sellerId: listing.sellerId,
    sellerName: listing.sellerName,
    units: listing.units,
    pricePerUnit: listing.pricePerUnit,
    originalPricePerUnit: listing.originalPricePerUnit,
    totalValue: listing.totalValue,
    listedAt: listing.listedAt,
    status: listing.status,
    imageSeed: listing.imageSeed,
    soldAt: listing.soldAt ?? undefined,
    buyerId: listing.buyerId ?? undefined,
  };
}

export async function listResaleListings({ status } = {}) {
  const listings = await store.read("resaleListings");
  return listings
    .filter((listing) => (status && status !== "all" ? listing.status === status : true))
    .sort((a, b) => new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime())
    .map(toPublicListing);
}

export async function getResaleListing(id) {
  const listings = await store.read("resaleListings");
  return toPublicListing(findResaleListing(listings, id));
}

export async function createResaleListing({ propertyId, units, pricePerUnit, sellerName }, actor) {
  const sellerId = actor?.id;
  if (!sellerId) throw AppError.unauthorized("Sign in to list units for resale.");

  return store.transact(["resaleListings", "properties", "investments"], (drafts) => {
    const property = findProperty(drafts.properties, propertyId);

    if (!Number.isInteger(units) || units <= 0) {
      throw AppError.unprocessable("Units must be greater than zero.");
    }
    if (!Number.isFinite(pricePerUnit) || pricePerUnit <= 0) {
      throw AppError.unprocessable("Enter a valid asking price per unit.");
    }

    const held = holdingUnits(drafts.investments, sellerId, propertyId);
    if (held === 0) {
      throw AppError.unprocessable("Select a property you own units in.");
    }
    if (units > held) {
      throw AppError.unprocessable(`You can list at most ${held} units for this property.`);
    }

    const listing = {
      id: makeId("RSL"),
      propertyId: property.id,
      propertyTitle: property.title,
      city: property.city,
      sellerId,
      sellerName: sellerName ?? actor.name ?? "LANDCHAIN investor",
      units,
      pricePerUnit,
      originalPricePerUnit: property.unitPrice,
      totalValue: units * pricePerUnit,
      listedAt: now(),
      status: "active",
      imageSeed: property.imageSeed,
      soldAt: null,
      buyerId: null,
    };

    drafts.resaleListings.push(listing);
    return toPublicListing(listing);
  });
}

export async function cancelResaleListing(id, actor) {
  return store.transact(["resaleListings"], (drafts) => {
    const listing = findResaleListing(drafts.resaleListings, id);
    if (listing.status !== "active") {
      throw AppError.conflict("Only active listings can be cancelled.");
    }
    if (actor?.id && actor.role !== "admin" && listing.sellerId !== actor.id) {
      throw AppError.forbidden("You can only cancel your own listings.");
    }
    listing.status = "cancelled";
    listing.cancelledAt = now();
    listing.updatedAt = listing.cancelledAt;
    return toPublicListing(listing);
  });
}

/**
 * Transfer units from the listing seller to the buyer. Units move between
 * investment records (FIFO), and the movement is captured as append-only
 * ownership + token + transaction records.
 */
export async function buyResaleListing(id, actor) {
  const buyerId = actor?.id;
  if (!buyerId) throw AppError.unauthorized("Sign in to purchase a resale listing.");

  return store.transact(
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
      const listing = findResaleListing(drafts.resaleListings, id);
      if (listing.status !== "active") {
        throw AppError.conflict("This listing is no longer available.");
      }
      if (listing.sellerId === buyerId) {
        throw AppError.conflict("You cannot buy your own listing.");
      }

      const property = findProperty(drafts.properties, listing.propertyId);
      const held = holdingUnits(drafts.investments, listing.sellerId, listing.propertyId);
      if (held < listing.units) {
        throw AppError.conflict(
          "The seller no longer holds enough units to complete this sale.",
        );
      }

      let remaining = listing.units;
      const sellerInvestments = drafts.investments
        .filter(
          (investment) =>
            investment.userId === listing.sellerId &&
            investment.propertyId === listing.propertyId &&
            investment.status === "confirmed" &&
            investment.units > 0,
        )
        .sort((a, b) => new Date(a.purchasedAt).getTime() - new Date(b.purchasedAt).getTime());

      for (const investment of sellerInvestments) {
        if (remaining === 0) break;
        const take = Math.min(investment.units, remaining);
        investment.units -= take;
        investment.amount = investment.units * investment.pricePerUnit;
        investment.ownershipPercent = Number(
          ((investment.units / property.totalUnits) * 100).toFixed(4),
        );
        remaining -= take;
      }
      if (remaining > 0) {
        throw AppError.conflict("The seller's holdings could not be split for this sale.");
      }

      const timestamp = now();
      const amount = listing.units * listing.pricePerUnit;
      const buyerTxHash = pseudoTxHash(`resale:${listing.id}:${buyerId}:${timestamp}`);
      const sellerTxHash = pseudoTxHash(`resale-sale:${listing.id}:${listing.sellerId}:${timestamp}`);
      const buyer = drafts.users.find((candidate) => candidate.id === buyerId);

      const purchase = {
        id: makeId("INV"),
        propertyId: property.id,
        propertyTitle: property.title,
        userId: buyerId,
        investorName: buyer?.name ?? "LANDCHAIN investor",
        units: listing.units,
        pricePerUnit: listing.pricePerUnit,
        amount,
        ownershipPercent: Number(((listing.units / property.totalUnits) * 100).toFixed(4)),
        purchasedAt: timestamp,
        status: "confirmed",
        txHash: buyerTxHash,
        source: "resale",
        listingId: listing.id,
      };
      drafts.investments.push(purchase);

      const buyerTransaction = appendTransaction(drafts, {
        type: "resale_purchase",
        description: `${property.title} · ${listing.units} units (resale)`,
        amount: -amount,
        userId: buyerId,
        propertyId: property.id,
        units: listing.units,
        reference: buyerTxHash,
      });

      const sellerTransaction = appendTransaction(drafts, {
        type: "resale_sale",
        description: `${property.title} · ${listing.units} units sold`,
        amount,
        userId: listing.sellerId,
        propertyId: property.id,
        units: listing.units,
        reference: sellerTxHash,
      });

      appendTokenRecord(drafts, {
        propertyId: property.id,
        userId: buyerId,
        fromUserId: listing.sellerId,
        units: listing.units,
        investmentId: purchase.id,
        transactionId: buyerTransaction.id,
        type: "transfer",
      });

      appendOwnershipRecord(drafts, {
        propertyId: property.id,
        units: listing.units,
        fromUserId: listing.sellerId,
        toUserId: buyerId,
        type: "resale_transfer",
        investmentId: purchase.id,
        transactionId: buyerTransaction.id,
        pricePerUnit: listing.pricePerUnit,
        ownershipPercent: purchase.ownershipPercent,
        propertyVersion: property.version,
      });

      for (const userId of [listing.sellerId, buyerId]) {
        upsertInvestorProfile(drafts, userId);
        recomputeUserAggregates(drafts.users, drafts.investments, userId);
      }

      listing.status = "sold";
      listing.soldAt = timestamp;
      listing.buyerId = buyerId;
      listing.updatedAt = timestamp;
      listing.buyerTransactionId = buyerTransaction.id;
      listing.sellerTransactionId = sellerTransaction.id;
      listing.txHash = buyerTxHash;

      return {
        ...toPublicListing(listing),
        amount,
        transaction: {
          id: buyerTransaction.id,
          reference: buyerTransaction.reference,
        },
      };
    },
  );
}

export async function resaleStats() {
  const { resaleListings: listings, properties } = await store.readMany([
    "resaleListings",
    "properties",
  ]);
  const active = listings.filter((listing) => listing.status === "active");
  return {
    totalListings: listings.length,
    activeListings: active.length,
    soldListings: listings.filter((listing) => listing.status === "sold").length,
    activeValue: active.reduce((sum, listing) => sum + listing.totalValue, 0),
    propertiesCount: properties.length,
  };
}
