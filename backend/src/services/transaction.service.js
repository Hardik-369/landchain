import { store } from "../lib/store.js";
import { AppError } from "../lib/errors.js";
import { makeId } from "../lib/ids.js";
import { TRANSACTION_STATUSES, TRANSACTION_TYPES } from "../lib/constants.js";
import { findById } from "../lib/records.js";

/** Append a transaction row inside an open transaction. */
export function appendTransaction(
  drafts,
  {
    type,
    description,
    amount,
    userId = null,
    propertyId = null,
    units = null,
    status = "completed",
    reference,
    metadata = undefined,
    date = new Date().toISOString(),
  },
) {
  if (!TRANSACTION_TYPES.includes(type)) {
    throw AppError.unprocessable(`Transaction type must be one of: ${TRANSACTION_TYPES.join(", ")}.`);
  }
  if (!TRANSACTION_STATUSES.includes(status)) {
    throw AppError.unprocessable(`Transaction status must be one of: ${TRANSACTION_STATUSES.join(", ")}.`);
  }

  const transaction = {
    id: makeId("TXN"),
    type,
    description,
    amount,
    userId,
    propertyId,
    units,
    date,
    status,
    reference: reference ?? makeId("REF"),
    metadata,
    createdAt: new Date().toISOString(),
  };

  drafts.transactions.push(transaction);
  return transaction;
}

/** Token allocation row - minted on primary investment, moved on resale. */
export function appendTokenRecord(
  drafts,
  { propertyId, userId, units, investmentId = null, transactionId = null, type = "allocation", fromUserId = null },
) {
  const record = {
    id: makeId("TOK"),
    propertyId,
    userId,
    fromUserId,
    units,
    investmentId,
    transactionId,
    type,
    tokenSymbol: drafts.platformSettings?.tokenSymbol ?? "LANDT",
    status: "settled",
    createdAt: new Date().toISOString(),
  };
  drafts.tokenRecords.push(record);
  return record;
}

export function listTransactions(records, { userId, propertyId, type, status, limit } = {}) {
  const filtered = records
    .filter((transaction) => (userId ? transaction.userId === userId : true))
    .filter((transaction) => (propertyId ? transaction.propertyId === propertyId : true))
    .filter((transaction) => (type ? transaction.type === type : true))
    .filter((transaction) => (status ? transaction.status === status : true))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return typeof limit === "number" ? filtered.slice(0, limit) : filtered;
}

/** Public ledger projection (frontend `Transaction`). */
export function toPublicTransaction(transaction) {
  return {
    id: transaction.id,
    type: transaction.type,
    description: transaction.description,
    amount: transaction.amount,
    date: transaction.date,
    status: transaction.status,
    reference: transaction.reference,
    userId: transaction.userId,
    propertyId: transaction.propertyId,
    units: transaction.units,
  };
}

export async function getTransactions(filters) {
  const records = await store.read("transactions");
  return listTransactions(records, filters);
}

export async function getTransactionById(id) {
  const records = await store.read("transactions");
  return findById(records, id, "Transaction");
}

export async function recordManualTransaction(payload, actor) {
  return store.transact(["transactions"], (drafts) => {
    const transaction = appendTransaction(drafts, {
      ...payload,
      metadata: { ...(payload.metadata ?? {}), recordedBy: actor?.id ?? "system", manual: true },
    });
    return transaction;
  });
}
