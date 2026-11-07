/**
 * External investor system.
 *
 * Registering an external investor creates (or links) a Contributor 2 `users`
 * record and an `investors` profile, then tracks participation through the
 * shared investments/transactions collections. Registration itself does not
 * move money or units - `investment.service.js` owns that.
 */
import { makeId } from "../../../backend/src/lib/ids.js";
import { store } from "../lib/store.js";
import { AppError } from "../lib/errors.js";
import { now, upsertInvestorProfile } from "../lib/records.js";
import { resolveRules, INVESTOR_TYPES } from "../thresholds.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EVM_WALLET = /^0x[a-fA-F0-9]{40}$/;
const HEDERA_ACCOUNT = /^\d+\.\d+\.\d+$/;

export function isWalletAddress(value) {
  return EVM_WALLET.test(String(value ?? "")) || HEDERA_ACCOUNT.test(String(value ?? ""));
}

function publicInvestor(profile, investments = []) {
  const confirmed = investments.filter(
    (investment) => investment.userId === profile.userId && investment.status === "confirmed",
  );
  return {
    id: profile.id,
    userId: profile.userId,
    name: profile.name,
    email: profile.email ?? null,
    investorType: profile.investorType ?? "buyer",
    status: profile.status ?? "active",
    kycStatus: profile.kycStatus,
    walletAddress: profile.walletAddress ?? null,
    totalUnits: confirmed.reduce((sum, investment) => sum + investment.units, 0),
    totalInvested: confirmed.reduce((sum, investment) => sum + investment.amount, 0),
    propertiesCount: new Set(confirmed.map((investment) => investment.propertyId)).size,
    holdings: profile.holdings ?? [],
    registeredAt: profile.createdAt,
    updatedAt: profile.updatedAt ?? profile.createdAt,
  };
}

export async function listInvestors({ type, propertyId } = {}) {
  const { investors, investments } = await store.readMany(["investors", "investments"]);
  const relevant = propertyId
    ? new Set(
        investments
          .filter((investment) => investment.propertyId === propertyId)
          .map((investment) => investment.userId),
      )
    : null;

  return investors
    .filter((profile) => (type ? (profile.investorType ?? "buyer") === type : true))
    .filter((profile) => (relevant ? relevant.has(profile.userId) : true))
    .map((profile) => publicInvestor(profile, investments))
    .sort((a, b) => b.totalInvested - a.totalInvested);
}

export async function getInvestor(userId) {
  const { investors, investments } = await store.readMany(["investors", "investments"]);
  const profile = investors.find((candidate) => candidate.userId === userId);
  if (!profile) throw AppError.notFound(`Investor ${userId} is not registered.`);
  return publicInvestor(profile, investments);
}

/**
 * Register (or refresh) an external investor.
 *
 * Idempotent by `userId` / `email`: registering twice updates the KYC and wallet
 * details instead of creating a second profile.
 */
export async function registerInvestor({
  userId,
  name,
  email,
  mobile,
  walletAddress,
  investorType = "external",
  kycStatus,
}) {
  const type = String(investorType).toLowerCase();
  if (!INVESTOR_TYPES.includes(type)) {
    throw AppError.unprocessable(`Investor type must be one of: ${INVESTOR_TYPES.join(", ")}.`);
  }
  if (!name || !String(name).trim()) {
    throw AppError.unprocessable("Investor name is required.");
  }
  if (email && !EMAIL_PATTERN.test(String(email).trim())) {
    throw AppError.unprocessable("Enter a valid email address.");
  }
  if (walletAddress && !isWalletAddress(walletAddress)) {
    throw AppError.unprocessable(
      "Wallet address must be an EVM address (0x + 40 hex characters) or a Hedera account id (0.0.x).",
    );
  }

  return store.transact(["users", "investors", "investments"], (drafts) => {
    const cleanEmail = email ? String(email).trim().toLowerCase() : null;

    let user = userId
      ? drafts.users.find((candidate) => candidate.id === userId)
      : null;
    if (!user && cleanEmail) {
      user = drafts.users.find(
        (candidate) => String(candidate.email ?? "").toLowerCase() === cleanEmail,
      );
    }
    if (userId && !user) {
      throw AppError.notFound(`User ${userId} does not exist.`);
    }

    if (!user) {
      user = {
        id: makeId("USER"),
        name: String(name).trim(),
        email: cleanEmail,
        mobile: mobile ? String(mobile).replace(/\D/g, "").slice(-10) : null,
        role: "investor",
        kycStatus: kycStatus ?? "pending",
        walletAddress: walletAddress ?? null,
        status: "active",
        joinedAt: now(),
        lastLoginAt: null,
        propertiesOwned: 0,
        totalInvested: 0,
      };
      drafts.users.push(user);
    } else {
      user.name = user.name ?? String(name).trim();
      if (cleanEmail) user.email = cleanEmail;
      if (walletAddress) user.walletAddress = walletAddress;
      if (kycStatus) user.kycStatus = kycStatus;
    }

    let profile = drafts.investors.find((candidate) => candidate.userId === user.id);
    if (!profile) {
      profile = {
        id: makeId("INVSTR"),
        userId: user.id,
        name: user.name,
        email: user.email ?? cleanEmail,
        kycStatus: user.kycStatus ?? "pending",
        investorType: type,
        status: "active",
        walletAddress: walletAddress ?? user.walletAddress ?? null,
        holdings: [],
        totalInvested: 0,
        totalUnits: 0,
        propertiesCount: 0,
        createdAt: now(),
      };
      drafts.investors.push(profile);
    } else {
      profile.investorType = type;
      profile.status = "active";
      profile.name = user.name;
      profile.email = user.email ?? profile.email ?? null;
      profile.kycStatus = user.kycStatus ?? profile.kycStatus;
      if (walletAddress) profile.walletAddress = walletAddress;
    }

    profile.registeredAt = profile.registeredAt ?? profile.createdAt;
    profile.walletAddress = walletAddress ?? profile.walletAddress ?? null;

    upsertInvestorProfile(drafts, user.id, { investorType: type });

    return {
      ...publicInvestor(profile, drafts.investments),
      walletAddress: profile.walletAddress,
    };
  });
}

/** Full participation history for one investor. */
export async function investorHistory(userId) {
  const { investors, investments, transactions, ownershipHistory, resaleListings } =
    await store.readMany([
      "investors",
      "investments",
      "transactions",
      "ownershipHistory",
      "resaleListings",
    ]);

  const profile = investors.find((candidate) => candidate.userId === userId);
  if (!profile) throw AppError.notFound(`Investor ${userId} is not registered.`);

  const byDate = (a, b) =>
    new Date(b.createdAt ?? b.purchasedAt ?? b.listedAt ?? 0).getTime() -
    new Date(a.createdAt ?? a.purchasedAt ?? a.listedAt ?? 0).getTime();

  return {
    investor: publicInvestor(profile, investments),
    investments: investments
      .filter((investment) => investment.userId === userId)
      .sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime()),
    transactions: transactions
      .filter((transaction) => transaction.userId === userId)
      .sort(byDate),
    ownership: ownershipHistory
      .filter((record) => record.toUserId === userId || record.fromUserId === userId)
      .sort(byDate),
    resales: {
      sold: resaleListings
        .filter((listing) => listing.sellerId === userId && listing.status === "sold")
        .sort(byDate),
      bought: resaleListings
        .filter((listing) => listing.buyerId === userId)
        .sort(byDate),
      active: resaleListings
        .filter((listing) => listing.sellerId === userId && listing.status === "active")
        .sort(byDate),
    },
  };
}

/**
 * Resolve the investor type for an investment and enforce that external
 * investors registered first.
 */
export function resolveInvestorType({ investorType, profile, requestedByClient = false }) {
  const declared = investorType ? String(investorType).toLowerCase() : null;
  if (declared && !INVESTOR_TYPES.includes(declared)) {
    throw AppError.unprocessable(`Investor type must be one of: ${INVESTOR_TYPES.join(", ")}.`);
  }
  if (declared === "external" && !profile) {
    throw AppError.unprocessable(
      "Register as an external investor before investing (POST /api/engine/investors).",
    );
  }
  if (declared) return declared;
  if (profile?.investorType) return profile.investorType;
  if (requestedByClient || profile) return "buyer";
  return "buyer";
}

/** Thresholds shown at registration so the UI can pre-fill minimums. */
export function registrationLimits(property) {
  if (!property) return null;
  const rules = resolveRules(property);
  return {
    propertyId: property.id,
    unitValue: rules.unitValue,
    buyer: rules.buyer,
    external: rules.external,
    investors: rules.investors,
    currency: "INR",
  };
}
