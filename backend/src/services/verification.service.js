import { store } from "../lib/store.js";
import { AppError } from "../lib/errors.js";
import { makeId } from "../lib/ids.js";
import { ROLES, VERIFICATION_STATUSES } from "../lib/constants.js";
import { appendPropertyVersion } from "./hashRegistry.service.js";
import { findProperty } from "../lib/records.js";

/**
 * Append one immutable verification row. This is the only way records enter
 * verificationRecords.json, so the audit trail can never be rewritten.
 */
export function appendVerificationRecord(
  drafts,
  { propertyId = null, subjectType = "property", subjectId = null, action, actor, role, hash, status, note },
) {
  const record = {
    id: makeId("VER"),
    propertyId,
    subjectType,
    subjectId: subjectId ?? propertyId,
    action,
    actor: actor?.name ?? actor?.id ?? "LANDCHAIN",
    actorId: actor?.id ?? "system",
    role: role ?? actor?.role ?? "system",
    hash: hash ?? null,
    timestamp: new Date().toISOString(),
    status,
    note: note ?? null,
  };
  drafts.verificationRecords.push(record);
  return record;
}

export function listVerificationRecords(records, { propertyId, status, actorId, limit } = {}) {
  const filtered = records
    .filter((record) => (propertyId ? record.propertyId === propertyId || record.subjectId === propertyId : true))
    .filter((record) => (status ? record.status === status : true))
    .filter((record) => (actorId ? record.actorId === actorId : true))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return typeof limit === "number" ? filtered.slice(0, limit) : filtered;
}

/**
 * Approve or reject a property. Writes a new hash version and an append-only
 * verification record in the same transaction as the status change.
 */
export async function decidePropertyVerification(propertyId, { action, note }, actor) {
  if (!["approve", "reject"].includes(action)) {
    throw AppError.unprocessable('Action must be either "approve" or "reject".');
  }

  return store.transact(
    ["properties", "propertyHashes", "verificationRecords"],
    (drafts) => {
      const property = findProperty(drafts.properties, propertyId);

      if (!["pending_verification", "rejected", "open"].includes(property.status)) {
        throw AppError.conflict(
          `Property is ${property.status}; only pending, rejected or open properties can be re-verified.`,
        );
      }

      const approved = action === "approve";
      const now = new Date().toISOString();
      property.status = approved ? "open" : "rejected";
      if (approved) property.verifiedAt = now;
      property.updatedAt = now;

      const version = appendPropertyVersion(drafts, property, {
        actor,
        changeType: approved ? "verification_approved" : "verification_rejected",
      });

      const record = appendVerificationRecord(drafts, {
        propertyId: property.id,
        action: approved ? "Property verified" : "Property rejected",
        actor,
        role: actor?.role,
        hash: version.hash,
        status: approved ? "verified" : "flagged",
        note: note ?? (approved
          ? "Documents and ownership details verified by the platform admin."
          : "Verification declined by the platform admin."),
      });

      return {
        propertyId: property.id,
        status: approved ? "verified" : "rejected",
        decidedAt: now,
        txHash: version.hash,
        note: record.note,
      };
    },
  );
}

/** PAN verification simulation - the hash is stored, the raw PAN never is. */
export function recordPanVerification(drafts, { user, panMasked, panHash }) {
  return appendVerificationRecord(drafts, {
    propertyId: null,
    subjectType: "user",
    subjectId: user.id,
    action: "PAN verified",
    actor: user,
    role: user.role,
    hash: panHash,
    status: "verified",
    note: `PAN ${panMasked} verified through the simulated NSDL check.`,
  });
}

export function assertVerificationStatus(status) {
  if (!VERIFICATION_STATUSES.includes(status)) {
    throw AppError.unprocessable(
      `Status must be one of: ${VERIFICATION_STATUSES.join(", ")}.`,
    );
  }
  return status;
}

export function assertRole(role) {
  if (!ROLES.includes(role)) {
    throw AppError.unprocessable(`Role must be one of: ${ROLES.join(", ")}.`);
  }
  return role;
}

export async function listVerificationRecordsPublic(filters) {
  const records = await store.read("verificationRecords");
  return listVerificationRecords(records, filters);
}

export async function getPropertyVerificationHistory(propertyId) {
  const { verificationRecords: records, properties } = await store.readMany([
    "verificationRecords",
    "properties",
  ]);
  const property = properties.find((item) => item.id === propertyId);
  if (!property) throw AppError.notFound(`Property ${propertyId} was not found.`);
  return listVerificationRecords(records, { propertyId }).reverse();
}
