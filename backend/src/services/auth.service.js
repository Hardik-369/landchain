import { store } from "../lib/store.js";
import { AppError } from "../lib/errors.js";
import { config } from "../config.js";
import { signToken, revokeToken } from "../lib/token.js";
import { otpChallenges, otpFingerprint, panFingerprint, rateLimit } from "../lib/security.js";
import { makeId, randomOtp } from "../lib/ids.js";
import { safeEqual } from "../lib/hash.js";
import { maskPan, normalizeMobile } from "../lib/validate.js";
import { ROLES } from "../lib/constants.js";
import { createUserRecord, findUserByMobile, toPublicUser } from "./user.service.js";
import { appendVerificationRecord, recordPanVerification } from "./verification.service.js";

const OTP_TTL_SECONDS = config.otp.ttlSeconds;

function requireRole(role) {
  if (role === undefined || role === null || role === "") return "investor";
  const clean = String(role).trim().toLowerCase();
  if (!ROLES.includes(clean)) {
    throw AppError.unprocessable(`Role must be one of: ${ROLES.join(", ")}.`);
  }
  return clean;
}

/**
 * OTP simulation. The code is never stored in clear text: only a peppered
 * SHA-256 fingerprint lives in memory for the challenge TTL.
 */
export function requestOtp({ mobile, role, purpose = "login" }) {
  const normalized = normalizeMobile(mobile);
  if (!normalized) {
    throw AppError.unprocessable("Enter a valid 10-digit Indian mobile number.");
  }

  const limit = rateLimit(`otp:${normalized}`, { limit: 5, windowMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    throw AppError.tooManyRequests(
      `Too many OTP requests. Try again in ${limit.retryAfterSeconds}s.`,
    );
  }

  const requestId = makeId("OTP");
  const code =
    config.otp.devMode && config.otp.demoCode ? String(config.otp.demoCode) : randomOtp(6);
  const expiresAt = Date.now() + OTP_TTL_SECONDS * 1000;

  otpChallenges.set(requestId, {
    requestId,
    mobile: normalized,
    role: requireRole(role),
    purpose,
    fingerprint: otpFingerprint(requestId, normalized, code),
    attempts: 0,
    expiresAt,
  });

  // Simulation only: the "SMS" lands in the server log.
  console.log(`[landchain][otp] ${normalized} -> ${code} (request ${requestId})`);

  const result = {
    requestId,
    mobile: normalized,
    expiresInSeconds: OTP_TTL_SECONDS,
    channel: "sms",
  };
  if (config.otp.devMode) result.devOtp = code;
  return result;
}

export async function verifyOtp({ requestId, mobile, otp, role }) {
  const challenge = otpChallenges.get(requestId);
  if (!challenge) {
    throw new AppError(
      "This OTP request is unknown or has already been used. Request a new code.",
      400,
      "OTP_REQUEST_INVALID",
    );
  }

  const normalized = normalizeMobile(mobile);
  if (normalized !== challenge.mobile) {
    throw AppError.unprocessable("The mobile number does not match this OTP request.");
  }

  if (Date.now() > challenge.expiresAt) {
    otpChallenges.delete(requestId);
    throw new AppError("This OTP has expired. Request a new code.", 410, "OTP_EXPIRED");
  }

  if (challenge.attempts >= config.otp.maxAttempts) {
    otpChallenges.delete(requestId);
    throw AppError.tooManyRequests("Too many incorrect OTP attempts. Request a new code.");
  }

  challenge.attempts += 1;
  const code = String(otp ?? "").trim();
  if (!/^\d{6}$/.test(code) || !safeEqual(challenge.fingerprint, otpFingerprint(requestId, normalized, code))) {
    throw AppError.unauthorized("Incorrect OTP. Please try again.");
  }

  otpChallenges.delete(requestId);

  const user = await store.transact(["users", "verificationRecords"], (drafts) => {
    let record = findUserByMobile(drafts.users, normalized);

    if (!record) {
      // Simulated onboarding: an unknown mobile is registered on first verify.
      record = createUserRecord(drafts.users, {
        mobile: normalized,
        role: challenge.role ?? requireRole(role),
      });
      appendVerificationRecord(drafts, {
        propertyId: null,
        subjectType: "user",
        subjectId: record.id,
        action: "Mobile number verified",
        actor: record,
        role: record.role,
        hash: null,
        status: "verified",
        note: `OTP verified for ${record.mobile}.`,
      });
    }

    if (record.status === "suspended") {
      throw AppError.forbidden("This account is suspended. Contact platform support.");
    }

    record.lastLoginAt = new Date().toISOString();
    return record;
  });

  return {
    token: signToken(user),
    user: toPublicUser(user),
    expiresInSeconds: config.sessionTtlSeconds,
  };
}

export async function registerUser({ mobile, name, email, role }) {
  const normalized = normalizeMobile(mobile);
  if (!normalized) {
    throw AppError.unprocessable("Enter a valid 10-digit Indian mobile number.");
  }

  const user = await store.transact(["users", "verificationRecords"], (drafts) => {
    const record = createUserRecord(drafts.users, {
      name,
      mobile: normalized,
      email,
      role: requireRole(role),
    });
    appendVerificationRecord(drafts, {
      propertyId: null,
      subjectType: "user",
      subjectId: record.id,
      action: "Account registered",
      actor: record,
      role: record.role,
      hash: null,
      status: "pending",
      note: "Mobile OTP verification pending.",
    });
    return record;
  });

  return {
    user: toPublicUser(user),
    otp: requestOtp({ mobile: normalized, role: user.role, purpose: "registration" }),
  };
}

export async function linkWallet(address, actor) {
  if (!actor) {
    return { address, network: config.network, linked: false };
  }

  const user = await store.transact(["users", "verificationRecords"], (drafts) => {
    const record = drafts.users.find((candidate) => candidate.id === actor.id);
    if (!record) throw AppError.notFound("User not found.");

    record.walletAddress = address;
    record.updatedAt = new Date().toISOString();

    appendVerificationRecord(drafts, {
      propertyId: null,
      subjectType: "user",
      subjectId: record.id,
      action: "Wallet linked",
      actor: record,
      role: record.role,
      hash: address,
      status: "verified",
      note: `Wallet ${address} linked on ${config.network}.`,
    });
    return record;
  });

  return { address, network: config.network, linked: true, user: toPublicUser(user) };
}

export async function verifyPan(pan, actor) {
  const masked = maskPan(pan);
  const fingerprint = panFingerprint(pan);

  if (!actor) {
    return { panMasked: masked, status: "verified", linked: false };
  }

  const user = await store.transact(["users", "verificationRecords"], (drafts) => {
    const record = drafts.users.find((candidate) => candidate.id === actor.id);
    if (!record) throw AppError.notFound("User not found.");

    record.panHash = fingerprint;
    record.panMasked = masked;
    record.kycStatus = "verified";
    record.kycVerifiedAt = new Date().toISOString();
    record.updatedAt = record.kycVerifiedAt;

    recordPanVerification(drafts, { user: record, panMasked: masked, panHash: fingerprint });
    return record;
  });

  return {
    panMasked: masked,
    status: "verified",
    linked: true,
    kycStatus: user.kycStatus,
    user: toPublicUser(user),
  };
}

export function logout(token) {
  revokeToken(token);
  return { success: true, message: "Signed out." };
}

export function currentSession(user, token) {
  return {
    user: toPublicUser(user),
    expiresAt: new Date(Date.now() + config.sessionTtlSeconds * 1000).toISOString(),
    token,
  };
}
