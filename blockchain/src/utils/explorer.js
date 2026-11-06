/**
 * HashScan (Hedera Testnet explorer) link builders.
 *
 * Only validated, URL-safe identifiers are interpolated, so a caller cannot
 * smuggle a different path into a generated link.
 */
const { config } = require("../config");

function base() {
  return config.explorerUrl;
}

function safe(value, field) {
  const text = String(value ?? "").trim();
  if (!/^[A-Za-z0-9._:@-]{1,128}$/.test(text)) {
    throw new Error(`${field} contains characters that are not safe for an explorer URL.`);
  }
  return text;
}

const explorer = {
  transaction: (ref) => `${base()}/transaction/${safe(ref, "transaction")}`,
  account: (id) => `${base()}/account/${safe(id, "account")}`,
  token: (id) => `${base()}/token/${safe(id, "token")}`,
  topic: (id) => `${base()}/topic/${safe(id, "topic")}`,
  contract: (id) => `${base()}/contract/${safe(id, "contract")}`,
  /** Jump to one consensus message by sequence number. */
  topicMessage: (topicId, sequenceNumber) =>
    `${base()}/topic/${safe(topicId, "topic")}?m=${safe(sequenceNumber, "sequenceNumber")}`,
};

module.exports = { explorer };
