import { store } from "../lib/store.js";
import { AppError } from "../lib/errors.js";
import { makeId } from "../lib/ids.js";
import { pseudoTxHash } from "../lib/hash.js";
import { findById, findProperty } from "../lib/records.js";
import { recomputeUserAggregates } from "./user.service.js";
import { appendTokenRecord, appendTransaction } from "./transaction.service.js";

const CATEGORY_COLORS = {
  residential: "#10b981",
  commercial: "#38bdf8",
  land: "#a78bfa",
  industrial: "#fbbf24",
};

const INVESTABLE_STATUSES = ["open", "active", "funded"];

function now() {
  return new Date().toISOString();
}

export function availableUnits(property) {
  return Math.max(0, property.totalUnits - property.unitsSold);
}

export function minUnitsFor(property) {
  return Math.max(1, Math.ceil(property.minInvestment / property.unitPrice));
}

/** Units a user currently holds in one property (confirmed investments only). */
export function holdingUnits(investments, userId, propertyId) {
  return investments
    .filter(
      (investment) =>
        investment.userId === userId &&
        investment.propertyId === propertyId &&
        investment.status === "confirmed",
    )
    .reduce((sum, investment) => sum + investment.units, 0);
}

/** Append an immutable ownership movement record. */
export function appendOwnershipRecord(
  drafts,
  {
    propertyId,
    units,
    fromUserId = null,
    toUserId,
    type,
    investmentId = null,
    transactionId = null,
    pricePerUnit = null,
    ownershipPercent = null,
    propertyVersion = null,
  },
) {
  const record = {
    id: makeId("OWN"),
    propertyId,
    type,
    units,
    fromUserId,
    toUserId,
    investmentId,
    transactionId,
    pricePerUnit,
    ownershipPercent,
    propertyVersion,
    createdAt: now(),
  };
  drafts.ownershipHistory.push(record);
  return record;
}

/** Rebuild one investor's aggregate profile from investments. */
export function upsertInvestorProfile(drafts, userId) {
  const user = drafts.users.find((candidate) => candidate.id === userId);
  const confirmed = drafts.investments.filter(
    (investment) => investment.userId === userId && investment.status === "confirmed",
  );

  let profile = drafts.investors.find((candidate) => candidate.userId === userId);
  if (!profile) {
    profile = {
      id: makeId("INVSTR"),
      userId,
      name: user?.name ?? "LANDCHAIN investor",
      kycStatus: user?.kycStatus ?? "not_started",
      holdings: [],
      totalInvested: 0,
      totalUnits: 0,
      propertiesCount: 0,
      createdAt: now(),
    };
    drafts.investors.push(profile);
  }

  const byProperty = new Map();
  for (const investment of confirmed) {
    const entry = byProperty.get(investment.propertyId) ?? {
      propertyId: investment.propertyId,
      units: 0,
      invested: 0,
    };
    entry.units += investment.units;
    entry.invested += investment.amount;
    byProperty.set(investment.propertyId, entry);
  }

  profile.name = user?.name ?? profile.name;
  profile.kycStatus = user?.kycStatus ?? profile.kycStatus;
  profile.holdings = [...byProperty.values()].map((entry) => {
    const property = drafts.properties.find((candidate) => candidate.id === entry.propertyId);
    return {
      propertyId: entry.propertyId,
      title: property?.title ?? entry.propertyId,
      units: entry.units,
      invested: entry.invested,
      ownershipPercent: property?.totalUnits
        ? Number(((entry.units / property.totalUnits) * 100).toFixed(4))
        : 0,
    };
  });
  profile.totalInvested = confirmed.reduce((sum, investment) => sum + investment.amount, 0);
  profile.totalUnits = confirmed.reduce((sum, investment) => sum + investment.units, 0);
  profile.propertiesCount = byProperty.size;
  profile.updatedAt = now();

  return profile;
}

export function toPublicInvestment(investment) {
  return {
    id: investment.id,
    propertyId: investment.propertyId,
    propertyTitle: investment.propertyTitle,
    userId: investment.userId,
    investorName: investment.investorName,
    units: investment.units,
    pricePerUnit: investment.pricePerUnit,
    amount: investment.amount,
    ownershipPercent: investment.ownershipPercent,
    purchasedAt: investment.purchasedAt,
    status: investment.status,
    txHash: investment.txHash,
    source: investment.source ?? "primary",
    listingId: investment.listingId ?? undefined,
  };
}

/**
 * Primary-market purchase: allocates units, records the transaction, creates
 * the token allocation, appends ownership history and updates funding progress.
 */
export async function createInvestment({ propertyId, units, userId, actor }) {
  const investor = actor?.id ?? userId;
  if (!investor) throw AppError.unprocessable("An investor is required.");

  return store.transact(
    [
      "properties",
      "investments",
      "transactions",
      "tokenRecords",
      "ownershipHistory",
      "investors",
      "users",
      "platformSettings",
    ],
    (drafts) => {
      const property = findProperty(drafts.properties, propertyId);

      if (!INVESTABLE_STATUSES.includes(property.status)) {
        throw AppError.conflict(
          `Property is ${property.status} and is not open for investment.`,
        );
      }
      if (!Number.isInteger(units) || units <= 0) {
        throw AppError.unprocessable("Select at least one unit.");
      }

      const available = availableUnits(property);
      if (available === 0) {
        throw AppError.conflict("This property is fully funded.");
      }
      const minUnits = minUnitsFor(property);
      if (units < minUnits) {
        throw AppError.unprocessable(`Minimum investment is ${minUnits} units.`);
      }
      if (units > available) {
        throw AppError.conflict(`Only ${available} units are available for this property.`);
      }

      const amount = units * property.unitPrice;
      const maxAmount = Number(drafts.platformSettings?.maxInvestmentAmount ?? 0);
      if (maxAmount > 0 && amount > maxAmount) {
        throw AppError.unprocessable(
          `A single investment cannot exceed ₹${maxAmount.toLocaleString("en-IN")}.`,
        );
      }

      const user = drafts.users.find((candidate) => candidate.id === investor);
      const timestamp = now();
      const txHash = pseudoTxHash(`${property.id}:${investor}:${units}:${timestamp}:${Math.random()}`);

      const investment = {
        id: makeId("INV"),
        propertyId: property.id,
        propertyTitle: property.title,
        userId: investor,
        investorName: user?.name ?? "LANDCHAIN investor",
        units,
        pricePerUnit: property.unitPrice,
        amount,
        ownershipPercent: Number(((units / property.totalUnits) * 100).toFixed(4)),
        purchasedAt: timestamp,
        status: "confirmed",
        txHash,
        source: "primary",
      };
      drafts.investments.push(investment);

      property.unitsSold += units;
      property.updatedAt = timestamp;
      if (property.unitsSold >= property.totalUnits) {
        property.status = "funded";
      }

      const transaction = appendTransaction(drafts, {
        type: "investment",
        description: `${property.title} · ${units} units`,
        amount: -amount,
        userId: investor,
        propertyId: property.id,
        units,
        status: "completed",
        reference: txHash,
      });

      appendTokenRecord(drafts, {
        propertyId: property.id,
        userId: investor,
        units,
        investmentId: investment.id,
        transactionId: transaction.id,
        type: "allocation",
      });

      appendOwnershipRecord(drafts, {
        propertyId: property.id,
        units,
        toUserId: investor,
        type: "primary_allocation",
        investmentId: investment.id,
        transactionId: transaction.id,
        pricePerUnit: property.unitPrice,
        ownershipPercent: investment.ownershipPercent,
        propertyVersion: property.version,
      });

      upsertInvestorProfile(drafts, investor);
      recomputeUserAggregates(drafts.users, drafts.investments, investor);

      return {
        ...toPublicInvestment(investment),
        funding: {
          unitsSold: property.unitsSold,
          totalUnits: property.totalUnits,
          availableUnits: availableUnits(property),
          fundingPercent: Number(((property.unitsSold / property.totalUnits) * 100).toFixed(2)),
          status: property.status,
        },
      };
    },
  );
}

export async function listInvestments({ userId } = {}) {
  const investments = await store.read("investments");
  return investments
    .filter((investment) => (userId ? investment.userId === userId : true))
    .sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime())
    .map(toPublicInvestment);
}

export async function getInvestmentById(id) {
  const investments = await store.read("investments");
  return toPublicInvestment(findById(investments, id, "Investment"));
}

export async function listHoldings(userId) {
  const { investments, properties } = await store.readMany(["investments", "properties"]);
  const byProperty = new Map();

  for (const investment of investments) {
    if (investment.userId !== userId || investment.status !== "confirmed") continue;
    const property = properties.find((candidate) => candidate.id === investment.propertyId);
    const entry = byProperty.get(investment.propertyId) ?? {
      propertyId: investment.propertyId,
      propertyTitle: property?.title ?? investment.propertyTitle,
      city: property?.city ?? null,
      status: property?.status ?? null,
      units: 0,
      invested: 0,
      currentValue: 0,
    };
    entry.units += investment.units;
    entry.invested += investment.amount;
    entry.currentValue += investment.amount;
    byProperty.set(investment.propertyId, entry);
  }

  return [...byProperty.values()].map((entry) => ({
    ...entry,
    ownershipPercent: (() => {
      const property = properties.find((candidate) => candidate.id === entry.propertyId);
      return property?.totalUnits
        ? Number(((entry.units / property.totalUnits) * 100).toFixed(4))
        : 0;
    })(),
  }));
}

function monthsSince(iso) {
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, (Date.now() - start) / (1000 * 60 * 60 * 24 * 30.44));
}

/** Portfolio summary (frontend `PortfolioSummary`). */
export async function portfolioSummary(userId) {
  const { investments, properties } = await store.readMany(["investments", "properties"]);
  const mine = investments.filter(
    (investment) => investment.userId === userId && investment.status === "confirmed",
  );

  let invested = 0;
  let currentValue = 0;
  let units = 0;
  let ownershipSum = 0;
  let returns = 0;
  let rentalIncome = 0;
  const allocationMap = new Map();
  const valueByMonth = new Map();

  for (const investment of mine) {
    const property = properties.find((candidate) => candidate.id === investment.propertyId);
    invested += investment.amount;
    units += investment.units;
    ownershipSum += investment.ownershipPercent;

    if (!property) {
      currentValue += investment.amount;
      continue;
    }

    const held = monthsSince(investment.purchasedAt);
    const growth = 1 + (property.expectedAppreciation / 100) * (held / 60);
    const value = investment.amount * growth;
    currentValue += value;
    returns += value - investment.amount;
    rentalIncome += (investment.amount * (property.expectedYield / 100)) / 12;

    allocationMap.set(
      property.category,
      (allocationMap.get(property.category) ?? 0) + investment.amount,
    );

    const bought = new Date(investment.purchasedAt);
    const key = `${bought.getUTCFullYear()}-${bought.getUTCMonth()}`;
    valueByMonth.set(key, (valueByMonth.get(key) ?? 0) + investment.amount);
  }

  const allocation = [...allocationMap.entries()].map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
    color: CATEGORY_COLORS[name] ?? "#10b981",
  }));

  const performance = Array.from({ length: 6 }).map((_, index) => {
    const date = new Date();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - (5 - index));
    const label = date.toLocaleString("en-IN", { month: "short", timeZone: "UTC" });
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    const cumulative = [...valueByMonth.entries()]
      .filter(([entryKey]) => {
        const [year, month] = entryKey.split("-").map(Number);
        return (
          year < date.getUTCFullYear() ||
          (year === date.getUTCFullYear() && month <= date.getUTCMonth())
        );
      })
      .reduce((sum, [, value]) => sum + value, 0);
    return {
      month: label,
      invested: Math.round(cumulative),
      value: Math.round(cumulative * (1 + 0.012 * index)),
    };
  });

  return {
    totalInvested: Math.round(invested),
    currentValue: Math.round(currentValue),
    totalUnits: units,
    propertiesCount: new Set(mine.map((investment) => investment.propertyId)).size,
    avgOwnershipPercent: mine.length ? Number((ownershipSum / mine.length).toFixed(2)) : 0,
    totalReturns: Math.round(returns),
    monthlyRentalIncome: Math.round(rentalIncome),
    allocation,
    performance,
  };
}
