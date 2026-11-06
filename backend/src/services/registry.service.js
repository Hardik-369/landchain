import { store } from "../lib/store.js";
import { AppError } from "../lib/errors.js";
import { findProperty } from "../lib/records.js";
import { toPropertyResponse } from "./property.service.js";
import { propertyVersions } from "./hashRegistry.service.js";
import { listVerificationRecords } from "./verification.service.js";

export async function getRegistryEntries() {
  const {
    properties,
    documents,
    propertyHashes: hashes,
    verificationRecords: verifications,
  } = await store.readMany([
    "properties",
    "documents",
    "propertyHashes",
    "verificationRecords",
  ]);

  return properties
    .map((property) => {
      const propertyDocs = documents.filter((document) => document.propertyId === property.id);
      const records = verifications.filter((record) => record.propertyId === property.id);
      const versions = propertyVersions(hashes, property.id);
      const latest = versions[versions.length - 1];

      return {
        id: property.id,
        title: property.title,
        city: property.city,
        propertyHash: property.propertyHash,
        registryTxId: property.registryTxId,
        documentsCount: propertyDocs.length,
        verificationsCount: records.filter((record) => record.status === "verified").length,
        status: property.status,
        verifiedAt: property.verifiedAt,
        hashVersion: property.hashVersion ?? versions.length,
        updatedAt: latest?.createdAt ?? property.updatedAt ?? property.createdAt,
      };
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getRegistryRecord(id) {
  const {
    properties,
    documents,
    propertyHashes: hashes,
    verificationRecords: verifications,
  } = await store.readMany([
    "properties",
    "documents",
    "propertyHashes",
    "verificationRecords",
  ]);

  const property = properties.find((candidate) => candidate.id === id);
  if (!property) throw AppError.notFound(`Property ${id} was not found.`);

  const propertyDocs = documents.filter((document) => document.propertyId === property.id);
  const versions = propertyVersions(hashes, property.id);
  const records = listVerificationRecords(verifications, { propertyId: id }).reverse();

  const hashEvents = versions.map((version) => ({
    id: version.id,
    title: `Registry hash v${version.version}`,
    description: `Property hash recorded (${version.changeType.replace(/_/g, " ")}).`,
    timestamp: version.createdAt,
    status: "info",
    hash: version.hash,
  }));

  const verificationEvents = records.map((record) => ({
    id: record.id,
    title: record.action,
    description: record.note ?? `Recorded by ${record.actor}.`,
    timestamp: record.timestamp,
    status: record.status,
    hash: record.hash ?? undefined,
  }));

  const documentEvents = propertyDocs.map((document) => ({
    id: document.id,
    title: `Document anchored: ${document.name}`,
    description: `SHA-256 ${document.hash}`,
    timestamp: document.uploadedAt,
    status: document.status === "verified" ? "verified" : "info",
    hash: document.hash,
  }));

  const timeline = [...hashEvents, ...verificationEvents, ...documentEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  return {
    property: toPropertyResponse(property, propertyDocs),
    verifications: records,
    versions,
    timeline,
    integrity: {
      algorithm: "sha256",
      hashVersion: property.hashVersion ?? versions.length,
      propertyHash: property.propertyHash,
      registryTxId: property.registryTxId,
    },
  };
}
