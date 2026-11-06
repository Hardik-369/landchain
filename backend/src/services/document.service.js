import { store } from "../lib/store.js";
import { AppError } from "../lib/errors.js";
import { makeId } from "../lib/ids.js";
import { sha256 } from "../lib/hash.js";
import { DOCUMENT_STATUSES } from "../lib/constants.js";
import { findDocument, findProperty } from "../lib/records.js";

export const MAX_DOCUMENTS_PER_REQUEST = 10;

/** Shape embedded in a property payload (frontend `PropertyDocument`). */
export function toPropertyDocument(document) {
  return {
    id: document.id,
    name: document.name,
    type: document.type,
    hash: document.hash,
    size: document.size,
    uploadedAt: document.uploadedAt,
  };
}

/**
 * Append a document record inside an open transaction.
 *
 * Uploads are fictional: when `content` is supplied its SHA-256 is computed
 * from the bytes, otherwise a deterministic simulated payload hash is derived
 * from the metadata plus a nonce. Either way the stored hash is real SHA-256.
 */
export function appendDocument(
  drafts,
  { propertyId = null, ownerId = null, name, type = "PDF", size = "1.0 MB", content, status = "pending" },
) {
  if (!DOCUMENT_STATUSES.includes(status)) {
    throw AppError.unprocessable(`Document status must be one of: ${DOCUMENT_STATUSES.join(", ")}.`);
  }
  if (propertyId) findProperty(drafts.properties, propertyId);

  const nonce = makeId("DOCN");
  const hash =
    typeof content === "string" && content.length > 0
      ? sha256(content)
      : sha256(`${propertyId ?? ownerId ?? "unlinked"}:${name}:${size}:${nonce}`);
  const now = new Date().toISOString();

  const document = {
    id: makeId("DOC"),
    propertyId,
    ownerId,
    name,
    type: String(type).toUpperCase(),
    size,
    hash,
    algorithm: "sha256",
    status,
    statusHistory: [
      {
        status,
        note: "Document metadata recorded.",
        actor: ownerId ?? "system",
        at: now,
      },
    ],
    uploadedAt: now,
    verifiedAt: null,
  };

  drafts.documents.push(document);
  return document;
}

export function documentsForProperty(documents, propertyId) {
  return documents.filter((document) => document.propertyId === propertyId);
}

export function hydratePropertyDocuments(property, documents) {
  return {
    ...property,
    documents: documentsForProperty(documents, property.id).map(toPropertyDocument),
  };
}

export async function createDocument(payload, actor) {
  return store.transact(["documents", "properties"], (drafts) => {
    const document = appendDocument(drafts, {
      propertyId: payload.propertyId ?? null,
      ownerId: actor?.id ?? null,
      name: payload.name,
      type: payload.type,
      size: payload.size,
      content: payload.content,
      status: payload.status ?? "pending",
    });
    return document;
  });
}

export async function listDocuments({ propertyId, status, ownerId, hashesOnly } = {}) {
  const documents = await store.read("documents");
  const filtered = documents
    .filter((document) => (propertyId ? document.propertyId === propertyId : true))
    .filter((document) => (status ? document.status === status : true))
    .filter((document) => (ownerId ? document.ownerId === ownerId : true))
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

  return hashesOnly
    ? filtered.map((document) => ({
        id: document.id,
        propertyId: document.propertyId,
        name: document.name,
        hash: document.hash,
        status: document.status,
      }))
    : filtered;
}

export async function getDocument(id) {
  const documents = await store.read("documents");
  return findDocument(documents, id);
}

/**
 * Update verification status. documents.json is mutable, but every change is
 * appended to the document's own statusHistory so the trail stays auditable.
 */
export async function setDocumentStatus(id, { status, note }, actor) {
  if (!DOCUMENT_STATUSES.includes(status)) {
    throw AppError.unprocessable(`Status must be one of: ${DOCUMENT_STATUSES.join(", ")}.`);
  }

  return store.transact(["documents"], (drafts) => {
    const document = findDocument(drafts.documents, id);
    if (document.status === status) {
      throw AppError.conflict(`Document is already marked ${status}.`);
    }

    document.status = status;
    document.verifiedAt = status === "verified" ? new Date().toISOString() : null;
    document.statusHistory.push({
      status,
      note: note ?? null,
      actor: actor?.id ?? "system",
      at: new Date().toISOString(),
    });
    return document;
  });
}
