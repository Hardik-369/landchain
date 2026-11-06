import { store } from "../lib/store.js";
import { AppError } from "../lib/errors.js";
import { makeId, nextPropertyId } from "../lib/ids.js";
import { sha256 } from "../lib/hash.js";
import {
  PROPERTY_SORTS,
  PROPERTY_STATUS_TRANSITIONS,
  PROPERTY_STATUSES,
} from "../lib/constants.js";
import { findProperty } from "../lib/records.js";
import {
  appendDocument,
  documentsForProperty,
  hydratePropertyDocuments,
  toPropertyDocument,
} from "./document.service.js";
import {
  appendPropertyVersion,
  propertyVersions,
  verifyPropertyChain,
} from "./hashRegistry.service.js";
import { appendVerificationRecord } from "./verification.service.js";

const MIN_TOTAL_VALUE = 1_000_000;
const MIN_INVESTMENT = 10_000;

function now() {
  return new Date().toISOString();
}

export function toPropertyResponse(property, documents = []) {
  const hydrated = documents.length
    ? hydratePropertyDocuments(property, documents)
    : { ...property, documents: property.documents ?? [] };
  const availableUnits = Math.max(0, property.totalUnits - property.unitsSold);
  return {
    ...hydrated,
    availableUnits,
    fundingPercent: property.totalUnits
      ? Number(((property.unitsSold / property.totalUnits) * 100).toFixed(2))
      : 0,
  };
}

function matchesSearch(property, term) {
  const haystack = [
    property.id,
    property.title,
    property.city,
    property.state,
    property.address,
    property.description,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
}

function sortProperties(properties, sort) {
  const list = [...properties];
  switch (sort) {
    case "value_asc":
      return list.sort((a, b) => a.totalValue - b.totalValue);
    case "value_desc":
      return list.sort((a, b) => b.totalValue - a.totalValue);
    case "yield":
      return list.sort((a, b) => b.expectedYield - a.expectedYield);
    case "newest":
      return list.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    case "funding":
    default:
      return list.sort(
        (a, b) => b.unitsSold / (b.totalUnits || 1) - a.unitsSold / (a.totalUnits || 1),
      );
  }
}

export function filterProperties(properties, filters = {}) {
  const {
    search,
    city,
    state,
    category,
    status,
    sellerId,
    minInvestment,
    maxInvestment,
    featured,
    sort = "funding",
  } = filters;

  const term = String(search ?? "").trim().toLowerCase();
  const cityTerm = String(city ?? "").trim().toLowerCase();
  const stateTerm = String(state ?? "").trim().toLowerCase();

  const filtered = properties
    .filter((property) => (term ? matchesSearch(property, term) : true))
    .filter((property) => (cityTerm ? property.city.toLowerCase() === cityTerm : true))
    .filter((property) => (stateTerm ? property.state.toLowerCase() === stateTerm : true))
    .filter((property) =>
      category ? property.category === String(category).toLowerCase() : true,
    )
    .filter((property) => (status ? property.status === String(status).toLowerCase() : true))
    .filter((property) => (sellerId ? property.sellerId === sellerId : true))
    .filter((property) =>
      minInvestment !== undefined && minInvestment !== ""
        ? property.minInvestment <= Number(minInvestment)
        : true,
    )
    .filter((property) =>
      maxInvestment !== undefined && maxInvestment !== ""
        ? property.minInvestment <= Number(maxInvestment)
        : true,
    );

  const sorted = featured
    ? [...filtered].sort((a, b) => b.expectedYield - a.expectedYield)
    : sortProperties(filtered, PROPERTY_SORTS.includes(sort) ? sort : "funding");

  return sorted;
}

export async function listProperties(filters = {}) {
  const { properties, documents } = await store.readMany(["properties", "documents"]);
  const results = filterProperties(properties, filters);
  return results.map((property) => toPropertyResponse(property, documents));
}

export async function listSellerProperties(sellerId) {
  return listProperties({ sellerId, sort: "newest" });
}

export async function getPropertyById(id) {
  const { properties, documents } = await store.readMany(["properties", "documents"]);
  const property = properties.find((item) => item.id === id);
  if (!property) throw AppError.notFound(`Property ${id} was not found.`);
  return toPropertyResponse(property, documents);
}

export async function getPropertyVersions(id) {
  const { properties, propertyHashes: hashes } = await store.readMany([
    "properties",
    "propertyHashes",
  ]);
  findProperty(properties, id);
  return propertyVersions(hashes, id);
}

export async function getPropertyIntegrity(id) {
  const { properties, propertyHashes: hashes } = await store.readMany([
    "properties",
    "propertyHashes",
  ]);
  const property = findProperty(properties, id);
  const chain = verifyPropertyChain(hashes, id);
  return {
    ...chain,
    currentHash: property.propertyHash,
    hashMatchesLatestVersion:
      chain.checks.length === 0
        ? false
        : chain.checks[chain.checks.length - 1].hash === property.propertyHash,
  };
}

/**
 * Create a property plus its documents and first registry version in one
 * transaction, so a failure never leaves a half-created listing.
 */
export async function createProperty(input, actor, { requireDocuments = false } = {}) {
  const documents = Array.isArray(input.documents) ? input.documents : [];
  if (requireDocuments && documents.length === 0) {
    throw AppError.unprocessable("Upload at least one ownership document.");
  }
  if (input.totalValue < MIN_TOTAL_VALUE) {
    throw AppError.unprocessable("Total property value must be at least ₹10,00,000.");
  }
  if (input.minInvestment < MIN_INVESTMENT) {
    throw AppError.unprocessable("Minimum investment must be at least ₹10,000.");
  }
  if (input.areaSqft <= 0) {
    throw AppError.unprocessable("Enter a valid built-up area.");
  }

  return store.transact(
    ["properties", "documents", "propertyHashes", "verificationRecords"],
    (drafts) => {
      const unitPrice = input.minInvestment;
      const totalUnits = Math.max(1, Math.round(input.totalValue / unitPrice));
      const timestamp = now();
      const id = nextPropertyId(drafts.properties);

      const property = {
        id,
        title: input.title.trim(),
        description:
          input.description?.trim() ||
          `${input.title} is a ${input.category} asset in ${input.city}, tokenised for fractional ownership on LANDCHAIN.`,
        address: input.address?.trim() || input.city,
        city: input.city.trim(),
        state: input.state?.trim() || "—",
        category: input.category,
        status: "pending_verification",
        totalValue: input.totalValue,
        unitPrice,
        totalUnits,
        unitsSold: 0,
        minInvestment: input.minInvestment,
        expectedYield: input.expectedYield,
        expectedAppreciation: input.expectedAppreciation ?? 12,
        areaSqft: input.areaSqft,
        sellerId: input.sellerId ?? actor?.id ?? "system",
        sellerName: input.sellerName ?? actor?.name ?? "LANDCHAIN seller",
        imageSeed: (drafts.properties.length % 15) + 1,
        highlights: Array.isArray(input.highlights) && input.highlights.length
          ? input.highlights.slice(0, 6)
          : [
              `${input.category.charAt(0).toUpperCase() + input.category.slice(1)} asset`,
              input.city,
              "Pending registry verification",
            ],
        version: 0,
        hashVersion: 0,
        propertyHash: null,
        registryTxId: null,
        documentsCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      drafts.properties.push(property);

      for (const document of documents) {
        appendDocument(drafts, {
          propertyId: property.id,
          ownerId: property.sellerId,
          name: document.name,
          type: document.type,
          size: document.size,
          content: document.content,
          status: "pending",
        });
      }
      property.documentsCount = documents.length;

      const version = appendPropertyVersion(drafts, property, {
        actor,
        changeType: "created",
      });

      appendVerificationRecord(drafts, {
        propertyId: property.id,
        action: "Property submitted for verification",
        actor,
        role: actor?.role,
        hash: version.hash,
        status: "pending",
        note: `${documents.length} document(s) uploaded with the listing.`,
      });

      return toPropertyResponse(
        property,
        documentsForProperty(drafts.documents, property.id),
      );
    },
  );
}

const UPDATABLE_FIELDS = [
  "title",
  "description",
  "address",
  "city",
  "state",
  "category",
  "totalValue",
  "areaSqft",
  "minInvestment",
  "expectedYield",
  "expectedAppreciation",
  "highlights",
];

const HASH_FIELDS = [
  "title",
  "description",
  "address",
  "city",
  "state",
  "category",
  "totalValue",
  "unitPrice",
  "totalUnits",
  "minInvestment",
  "expectedYield",
  "expectedAppreciation",
  "areaSqft",
];

export async function updateProperty(id, patch, actor) {
  return store.transact(
    ["properties", "propertyHashes", "verificationRecords"],
    (drafts) => {
      const property = findProperty(drafts.properties, id);
      const before = Object.fromEntries(HASH_FIELDS.map((field) => [field, property[field]]));

      for (const field of UPDATABLE_FIELDS) {
        if (patch[field] === undefined) continue;
        if (field === "highlights") {
          property.highlights = Array.isArray(patch.highlights)
            ? patch.highlights.slice(0, 6).map(String)
            : property.highlights;
          continue;
        }
        property[field] = typeof patch[field] === "string" ? patch[field].trim() : patch[field];
      }

      if (patch.minInvestment !== undefined) {
        if (patch.minInvestment < MIN_INVESTMENT) {
          throw AppError.unprocessable("Minimum investment must be at least ₹10,000.");
        }
        property.unitPrice = patch.minInvestment;
      }
      if (patch.totalValue !== undefined || patch.minInvestment !== undefined) {
        if (property.totalValue < MIN_TOTAL_VALUE) {
          throw AppError.unprocessable("Total property value must be at least ₹10,00,000.");
        }
        const recalculated = Math.max(1, Math.round(property.totalValue / property.unitPrice));
        if (recalculated < property.unitsSold) {
          throw AppError.conflict(
            `Cannot reduce the unit count below the ${property.unitsSold} units already sold.`,
          );
        }
        property.totalUnits = recalculated;
      }
      if (patch.status !== undefined) {
        throw AppError.badRequest(
          "Use PATCH /api/properties/:id/status to change a property's status.",
        );
      }

      const changed = HASH_FIELDS.filter((field) => before[field] !== property[field]);
      if (!changed.length) {
        throw AppError.conflict("No changes were supplied for this property.");
      }

      property.updatedAt = now();
      const version = appendPropertyVersion(drafts, property, {
        actor,
        changeType: "details_updated",
      });

      appendVerificationRecord(drafts, {
        propertyId: property.id,
        action: "Property details updated",
        actor,
        role: actor?.role,
        hash: version.hash,
        status: "pending",
        note: `Updated fields: ${changed.join(", ")}. Re-verification required.`,
      });

      if (property.status === "open" || property.status === "active") {
        property.status = "pending_verification";
      }

      return toPropertyResponse(property, []);
    },
  );
}

export async function setPropertyStatus(id, status, actor, { note } = {}) {
  const next = String(status ?? "").toLowerCase();
  if (!PROPERTY_STATUSES.includes(next)) {
    throw AppError.unprocessable(`Status must be one of: ${PROPERTY_STATUSES.join(", ")}.`);
  }

  return store.transact(
    ["properties", "propertyHashes", "verificationRecords"],
    (drafts) => {
      const property = findProperty(drafts.properties, id);
      const allowed = PROPERTY_STATUS_TRANSITIONS[property.status] ?? [];
      if (!allowed.includes(next)) {
        throw AppError.conflict(
          `Cannot move a property from ${property.status} to ${next}. Allowed: ${allowed.join(", ") || "none"}.`,
        );
      }

      property.status = next;
      property.updatedAt = now();
      if (next === "open") property.verifiedAt = property.verifiedAt ?? now();

      const version = appendPropertyVersion(drafts, property, {
        actor,
        changeType: `status_${next}`,
      });

      appendVerificationRecord(drafts, {
        propertyId: property.id,
        action: `Status changed to ${next}`,
        actor,
        role: actor?.role,
        hash: version.hash,
        status: next === "rejected" ? "flagged" : next === "pending_verification" ? "pending" : "verified",
        note: note ?? `Status transitioned from ${property.status} to ${next}.`,
      });

      return toPropertyResponse(property, []);
    },
  );
}

/** Investment quote for a given unit count (server-side projection). */
export function quoteProperty(property, units) {
  const minUnits = Math.ceil(property.minInvestment / property.unitPrice);
  const maxUnits = Math.max(0, property.totalUnits - property.unitsSold);
  const requested = Number.isFinite(Number(units)) ? Math.round(Number(units)) : 0;
  const safeUnits = Math.min(Math.max(requested, 0), maxUnits);
  const amount = safeUnits * property.unitPrice;

  return {
    propertyId: property.id,
    units: safeUnits,
    unitPrice: property.unitPrice,
    amount,
    ownershipPercent: property.totalUnits
      ? Number(((safeUnits / property.totalUnits) * 100).toFixed(4))
      : 0,
    annualRentalIncome: Math.round((amount * property.expectedYield) / 100),
    projectedValue5Years: Math.round(amount * (1 + property.expectedAppreciation / 100)),
    projectedGain5Years: Math.round(
      amount * (1 + property.expectedAppreciation / 100) - amount,
    ),
    minUnits,
    maxUnits,
  };
}

export async function quotePropertyById(id, units) {
  const properties = await store.read("properties");
  const property = findProperty(properties, id);
  return quoteProperty(property, units);
}

/** Aggregate the seller dashboard metrics from live records. */
export async function getSellerStats(sellerId) {
  const { properties, investments } = await store.readMany(["properties", "investments"]);
  const mine = properties.filter((property) => property.sellerId === sellerId);
  const ids = new Set(mine.map((property) => property.id));

  const raised = mine.reduce((sum, property) => sum + property.unitsSold * property.unitPrice, 0);
  const relevantInvestments = investments.filter(
    (investment) => ids.has(investment.propertyId) && investment.status === "confirmed",
  );

  const monthlyFunding = Array.from({ length: 6 }).map((_, index) => {
    const date = new Date();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - (5 - index));
    const label = date.toLocaleString("en-IN", { month: "short", timeZone: "UTC" });
    const funded = relevantInvestments
      .filter((investment) => {
        const purchased = new Date(investment.purchasedAt);
        return (
          purchased.getUTCFullYear() === date.getUTCFullYear() &&
          purchased.getUTCMonth() === date.getUTCMonth()
        );
      })
      .reduce((sum, investment) => sum + investment.amount, 0);
    return { month: label, funded, target: Math.round(raised / 6) };
  });

  return {
    sellerId,
    portfolioValue: mine.reduce((sum, property) => sum + property.totalValue, 0),
    totalRaised: raised,
    activeListings: mine.filter((property) =>
      ["open", "active", "funded"].includes(property.status),
    ).length,
    totalInvestors: new Set(relevantInvestments.map((investment) => investment.userId)).size,
    propertiesCount: mine.length,
    monthlyFunding,
  };
}

export async function getSellerPropertySummaries(sellerId) {
  const { properties, investments } = await store.readMany(["properties", "investments"]);
  return properties
    .filter((property) => property.sellerId === sellerId)
    .map((property) => ({
      id: property.id,
      title: property.title,
      city: property.city,
      status: property.status,
      totalValue: property.totalValue,
      unitsSold: property.unitsSold,
      totalUnits: property.totalUnits,
      minInvestment: property.minInvestment,
      listedAt: property.createdAt,
      imageSeed: property.imageSeed,
      investors: new Set(
        investments
          .filter(
            (investment) =>
              investment.propertyId === property.id && investment.status === "confirmed",
          )
          .map((investment) => investment.userId),
      ).size,
    }))
    .sort((a, b) => new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime());
}

export function propertySummaryId(property) {
  return sha256(`${property.id}:${property.createdAt}`).slice(0, 10);
}

export { makeId, toPropertyDocument };
