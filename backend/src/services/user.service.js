import { store } from "../lib/store.js";
import { AppError } from "../lib/errors.js";
import { makeId } from "../lib/ids.js";
import { ROLES, KYC_STATUSES } from "../lib/constants.js";
import { isEmail, maskMobile, normalizeMobile } from "../lib/validate.js";

/** Public user projection - never leaks PAN hashes or internal flags. */
export function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    mobile: maskMobile(user.mobile),
    role: user.role,
    walletAddress: user.walletAddress ?? undefined,
    kycStatus: user.kycStatus,
    panMasked: user.panMasked ?? undefined,
    joinedAt: user.joinedAt,
    propertiesOwned: user.propertiesOwned ?? 0,
    totalInvested: user.totalInvested ?? 0,
    status: user.status ?? "active",
  };
}

export function findUserByMobile(users, mobile) {
  const normalized = normalizeMobile(mobile);
  if (!normalized) return undefined;
  return users.find((user) => normalizeMobile(user.mobile) === normalized);
}

export function findUserById(users, id) {
  return users.find((user) => user.id === id);
}

export function requireUser(users, id) {
  const user = findUserById(users, id);
  if (!user) throw AppError.notFound(`User ${id} was not found.`);
  return user;
}

/** Build (and push) a new user record inside an open transaction. */
export function createUserRecord(users, { name, mobile, email, role = "investor" }) {
  const normalized = normalizeMobile(mobile);
  if (!normalized) throw AppError.unprocessable("Enter a valid 10-digit Indian mobile number.");
  if (!ROLES.includes(role)) {
    throw AppError.unprocessable(`Role must be one of: ${ROLES.join(", ")}.`);
  }
  if (findUserByMobile(users, normalized)) {
    throw AppError.conflict("An account with this mobile number already exists.");
  }
  if (email) {
    const clean = String(email).trim().toLowerCase();
    if (!isEmail(clean)) throw AppError.unprocessable("Enter a valid email address.");
    if (users.some((user) => String(user.email ?? "").toLowerCase() === clean)) {
      throw AppError.conflict("An account with this email already exists.");
    }
  }

  const record = {
    id: makeId("USR"),
    name: name?.trim() || `LANDCHAIN ${role.charAt(0).toUpperCase()}${role.slice(1)}`,
    email: email ? String(email).trim().toLowerCase() : `${normalized}@landchain.local`,
    mobile: normalized,
    role,
    walletAddress: null,
    kycStatus: "not_started",
    panMasked: null,
    panHash: null,
    status: "active",
    joinedAt: new Date().toISOString(),
    lastLoginAt: null,
    propertiesOwned: 0,
    totalInvested: 0,
  };
  users.push(record);
  return record;
}

/** Recalculate headline aggregates for a user from confirmed investments. */
export function recomputeUserAggregates(users, investments, userId) {
  const user = findUserById(users, userId);
  if (!user) return null;
  const confirmed = investments.filter(
    (investment) => investment.userId === userId && investment.status === "confirmed",
  );
  user.propertiesOwned = new Set(confirmed.map((investment) => investment.propertyId)).size;
  user.totalInvested = confirmed.reduce((sum, investment) => sum + investment.amount, 0);
  return user;
}

export function listUsers(users, { role, kycStatus, search, status } = {}) {
  const term = search?.trim().toLowerCase();
  return users
    .filter((user) => (role ? user.role === role : true))
    .filter((user) => (kycStatus ? user.kycStatus === kycStatus : true))
    .filter((user) => (status ? (user.status ?? "active") === status : true))
    .filter((user) => {
      if (!term) return true;
      return `${user.id} ${user.name} ${user.email} ${user.mobile}`.toLowerCase().includes(term);
    })
    .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime());
}

export async function getUserById(id) {
  const users = await store.read("users");
  return toPublicUser(findUserById(users, id));
}

export async function getUserRecordById(id) {
  const users = await store.read("users");
  return findUserById(users, id) ?? null;
}

export async function updateUser(userId, patch, { actor } = {}) {
  return store.transact(["users"], (drafts) => {
    const user = requireUser(drafts.users, userId);

    if (patch.name !== undefined) user.name = String(patch.name).trim();
    if (patch.email !== undefined) {
      const email = String(patch.email).trim().toLowerCase();
      if (!isEmail(email)) throw AppError.unprocessable("Enter a valid email address.");
      const clash = drafts.users.find(
        (candidate) => candidate.id !== user.id && String(candidate.email).toLowerCase() === email,
      );
      if (clash) throw AppError.conflict("An account with this email already exists.");
      user.email = email;
    }
    if (patch.walletAddress !== undefined) {
      user.walletAddress = patch.walletAddress ? String(patch.walletAddress).trim() : null;
    }
    if (patch.kycStatus !== undefined) {
      if (!KYC_STATUSES.includes(patch.kycStatus)) {
        throw AppError.unprocessable(`KYC status must be one of: ${KYC_STATUSES.join(", ")}.`);
      }
      user.kycStatus = patch.kycStatus;
    }
    if (patch.status !== undefined) {
      if (!["active", "suspended"].includes(patch.status)) {
        throw AppError.unprocessable("Status must be active or suspended.");
      }
      user.status = patch.status;
    }

    user.updatedAt = new Date().toISOString();
    user.updatedBy = actor?.id ?? "system";
    return toPublicUser(user);
  });
}

export async function setUserRole(userId, role) {
  if (!ROLES.includes(role)) {
    throw AppError.unprocessable(`Role must be one of: ${ROLES.join(", ")}.`);
  }
  return store.transact(["users"], (drafts) => {
    const user = requireUser(drafts.users, userId);
    if (user.role === role) throw AppError.conflict(`User already has the ${role} role.`);
    user.previousRole = user.role;
    user.role = role;
    user.roleUpdatedAt = new Date().toISOString();
    return toPublicUser(user);
  });
}
