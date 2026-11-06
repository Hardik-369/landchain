import { hmac, safeEqual, sha256 } from "./hash.js";
import { config } from "../config.js";
import { AppError } from "./errors.js";

const revoked = new Set();

function base64url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(payload) {
  return hmac(payload, config.authSecret);
}

/** Stateless, HMAC-signed session token: payload.signature (both base64url). */
export function signToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    role: user.role,
    mobile: user.mobile,
    iat: now,
    exp: now + config.sessionTtlSeconds,
    jti: sha256(`${user.id}:${now}:${Math.random()}`).slice(0, 16),
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function verifyToken(token) {
  if (typeof token !== "string" || !token.includes(".")) {
    throw AppError.unauthorized("Invalid session token.");
  }
  if (revoked.has(token)) {
    throw AppError.unauthorized("This session has been signed out.");
  }
  const [encoded, signature] = token.split(".");
  if (!safeEqual(sign(encoded), signature)) {
    throw AppError.unauthorized("Invalid session token signature.");
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw AppError.unauthorized("Invalid session token payload.");
  }

  if (!payload?.sub || typeof payload.exp !== "number") {
    throw AppError.unauthorized("Invalid session token payload.");
  }
  if (payload.exp * 1000 <= Date.now()) {
    throw AppError.unauthorized("Your session has expired. Please sign in again.");
  }
  return payload;
}

export function revokeToken(token) {
  if (token) revoked.add(token);
}
