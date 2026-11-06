import { sha256 } from "../lib/hash.js";
import { makeId } from "../lib/ids.js";
import { PROPERTY_HASH_FIELDS } from "../lib/constants.js";

export const GENESIS_HASH = "0".repeat(64);

/** The exact asset payload that is hashed for the registry. */
export function propertyHashPayload(property) {
  const payload = {};
  for (const field of PROPERTY_HASH_FIELDS) {
    payload[field] = property[field] ?? null;
  }
  return payload;
}

export function propertyVersions(records, propertyId) {
  return records
    .filter((record) => record.propertyId === propertyId)
    .sort((a, b) => a.version - b.version);
}

export function latestPropertyVersion(records, propertyId) {
  const versions = propertyVersions(records, propertyId);
  return versions.length ? versions[versions.length - 1] : null;
}

/**
 * Append a new immutable version for a property.
 *
 * hash = sha256(propertyId | version | dataHash | previousHash)
 * which chains every version to its predecessor, so tampering with an older
 * record breaks the chain of all later versions.
 */
export function appendPropertyVersion(drafts, property, { actor, changeType = "updated" } = {}) {
  const previous = latestPropertyVersion(drafts.propertyHashes, property.id);
  const version = (previous?.version ?? 0) + 1;
  const dataHash = sha256(propertyHashPayload(property));

  const record = {
    id: makeId("PHASH"),
    propertyId: property.id,
    version,
    hash: sha256(`${property.id}|${version}|${dataHash}|${previous?.hash ?? GENESIS_HASH}`),
    previousHash: previous?.hash ?? GENESIS_HASH,
    dataHash,
    algorithm: "sha256",
    changeType,
    createdBy: actor?.id ?? "system",
    createdAt: new Date().toISOString(),
  };

  drafts.propertyHashes.push(record);

  property.version = version;
  property.hashVersion = version;
  property.propertyHash = record.hash;
  property.registryTxId =
    property.registryTxId ?? `0x${sha256(`${property.id}:${record.hash}`).slice(0, 40)}`;

  return record;
}

/** Recompute the chain to prove the registry records were not altered. */
export function verifyPropertyChain(records, propertyId) {
  const versions = propertyVersions(records, propertyId);
  let previousHash = GENESIS_HASH;
  const checks = versions.map((record) => {
    const expected = sha256(
      `${record.propertyId}|${record.version}|${record.dataHash}|${previousHash}`,
    );
    const valid = expected === record.hash && record.previousHash === previousHash;
    previousHash = record.hash;
    return {
      version: record.version,
      hash: record.hash,
      previousHash: record.previousHash,
      valid,
      createdAt: record.createdAt,
    };
  });

  return {
    propertyId,
    versions: checks.length,
    intact: checks.every((check) => check.valid),
    checks,
  };
}
