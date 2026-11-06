import { store } from "../lib/store.js";
import { AppError } from "../lib/errors.js";
import { PROPERTY_CATEGORIES } from "../lib/constants.js";
import { listProperties } from "./property.service.js";
import { listUsers, toPublicUser } from "./user.service.js";

const CATEGORY_COLORS = {
  residential: "#10b981",
  commercial: "#38bdf8",
  land: "#a78bfa",
  industrial: "#fbbf24",
};

const SETTINGS_KEYS = [
  "platformName",
  "tokenSymbol",
  "networkName",
  "currency",
  "maxInvestmentAmount",
  "maintenanceMode",
  "verificationSlaHours",
  "supportEmail",
];

export async function getAdminStats() {
  const { properties, users, transactions } = await store.readMany([
    "properties",
    "users",
    "transactions",
  ]);

  const monthlyVolume = Array.from({ length: 6 }).map((_, index) => {
    const date = new Date();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - (5 - index));
    const label = date.toLocaleString("en-IN", { month: "short", timeZone: "UTC" });
    const value = transactions
      .filter((transaction) => {
        if (transaction.status !== "completed") return false;
        const created = new Date(transaction.createdAt);
        return (
          created.getUTCFullYear() === date.getUTCFullYear() &&
          created.getUTCMonth() === date.getUTCMonth()
        );
      })
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
    return { month: label, value };
  });

  const categorySplit = PROPERTY_CATEGORIES.map((category) => ({
    name: category.charAt(0).toUpperCase() + category.slice(1),
    value: properties
      .filter((property) => property.category === category)
      .reduce((sum, property) => sum + property.unitsSold * property.unitPrice, 0),
    color: CATEGORY_COLORS[category],
  })).filter((entry) => entry.value > 0);

  return {
    totalProperties: properties.length,
    pendingVerification: properties.filter(
      (property) => property.status === "pending_verification",
    ).length,
    totalUsers: users.length,
    totalInvestment: properties.reduce(
      (sum, property) => sum + property.unitsSold * property.unitPrice,
      0,
    ),
    fundedProperties: properties.filter((property) =>
      ["funded", "active"].includes(property.status),
    ).length,
    monthlyVolume,
    categorySplit,
  };
}

export async function getAdminUsers() {
  const { users, investments } = await store.readMany(["users", "investments"]);
  return users.map((user) => {
    const confirmed = investments.filter(
      (investment) => investment.userId === user.id && investment.status === "confirmed",
    );
    return {
      ...toPublicUser(user),
      investments: confirmed.length,
      totalInvested: confirmed.reduce((sum, investment) => sum + investment.amount, 0),
      propertiesOwned: new Set(confirmed.map((investment) => investment.propertyId)).size,
    };
  });
}

export async function getVerificationQueue(status = "pending_verification") {
  return listProperties({ status, sort: "newest" });
}

export async function getPlatformSettings() {
  const settings = await store.read("platformSettings");
  return settings;
}

export async function updatePlatformSettings(patch, actor) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw AppError.unprocessable("Settings payload must be an object.");
  }

  return store.transact(["platformSettings"], (drafts) => {
    const settings = drafts.platformSettings;
    for (const [key, value] of Object.entries(patch)) {
      if (!SETTINGS_KEYS.includes(key)) {
        throw AppError.unprocessable(`Unknown setting "${key}".`);
      }
      if (key === "maxInvestmentAmount" || key === "verificationSlaHours") {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          throw AppError.unprocessable(`${key} must be a positive number.`);
        }
        settings[key] = numeric;
        continue;
      }
      if (key === "maintenanceMode") {
        settings[key] = Boolean(value);
        continue;
      }
      settings[key] = String(value);
    }
    settings.updatedAt = new Date().toISOString();
    settings.updatedBy = actor?.id ?? "system";
    return settings;
  });
}

export async function listDataBackups() {
  return store.listBackups();
}
