export const ROLES = ["buyer", "seller", "investor", "admin"];

export const KYC_STATUSES = ["verified", "pending", "not_started", "rejected"];

export const PROPERTY_CATEGORIES = ["residential", "commercial", "land", "industrial"];

export const PROPERTY_STATUSES = [
  "open",
  "funded",
  "active",
  "pending_verification",
  "rejected",
];

/** Allowed status moves - everything else is rejected with 409. */
export const PROPERTY_STATUS_TRANSITIONS = {
  pending_verification: ["open", "rejected"],
  open: ["funded", "active", "rejected"],
  funded: ["active", "open"],
  active: ["open", "funded"],
  rejected: ["pending_verification"],
};

export const DOCUMENT_STATUSES = ["pending", "verified", "flagged", "rejected"];

export const INVESTMENT_STATUSES = ["confirmed", "pending", "failed"];

export const TRANSACTION_TYPES = [
  "investment",
  "payout",
  "resale_purchase",
  "resale_sale",
  "refund",
  "token_allocation",
];

export const TRANSACTION_STATUSES = ["completed", "pending", "failed"];

export const RESALE_STATUSES = ["active", "sold", "cancelled"];

export const VERIFICATION_STATUSES = ["verified", "pending", "flagged"];

export const PROPERTY_SORTS = ["funding", "value_asc", "value_desc", "yield", "newest"];

/** Fields that are part of a property's on-registry hash payload. */
export const PROPERTY_HASH_FIELDS = [
  "id",
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
  "sellerId",
];
