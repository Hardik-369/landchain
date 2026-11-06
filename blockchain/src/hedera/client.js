/**
 * Hedera SDK client factory.
 *
 * The operator key lives only in this module's private scope. There is no
 * getter that returns it, so no API response can accidentally leak it.
 */
const { Client, AccountId, PrivateKey, Logger, LogLevel } = require("@hashgraph/sdk");
const {
  config,
  assertTestnet,
  hasOperatorCredentials,
  requireOperatorCredentials,
} = require("../config");
const { ConfigurationError, NetworkError } = require("../errors");

let cachedClient = null;
let cachedOperatorId = null;

/** Parse a DER (302e/302a) or raw ECDSA/ED25519 key without echoing it. */
function parsePrivateKey(raw, label = "HEDERA_OPERATOR_KEY") {
  if (!raw) {
    throw new ConfigurationError(`${label} is not set.`, { code: "MISSING_CREDENTIALS" });
  }
  const trimmed = String(raw).trim();
  // DER keys always start with a 30xx ASN.1 header; raw keys are 64 hex chars.
  const looksDer = /^30[0-9a-fA-F]{2}/.test(trimmed) && trimmed.length > 64;
  const candidates = looksDer
    ? [
        () => PrivateKey.fromStringDer(trimmed),
        () => PrivateKey.fromStringECDSA(trimmed),
        () => PrivateKey.fromStringED25519(trimmed),
      ]
    : [
        () => PrivateKey.fromStringECDSA(trimmed),
        () => PrivateKey.fromStringED25519(trimmed),
        () => PrivateKey.fromStringDer(trimmed),
      ];
  for (const attempt of candidates) {
    try {
      return attempt();
    } catch {
      // try the next format
    }
  }
  throw new ConfigurationError(
    `${label} is not a supported Hedera private key. Use the DER string or a raw key from the Hedera portal.`,
    { code: "INVALID_KEY" },
  );
}

/**
 * Build (or reuse) the singleton client.
 * @param {object} [options]
 * @param {boolean} [options.requireOperator=true] fail when no key is configured
 * @param {boolean} [options.fresh=false] bypass the cache (used by scripts)
 */
function createClient({ requireOperator = true, fresh = false } = {}) {
  assertTestnet();

  if (!fresh && cachedClient) {
    if (requireOperator && !cachedOperatorId) {
      throw new ConfigurationError(
        "This action needs a signing account. Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY.",
        { code: "MISSING_CREDENTIALS" },
      );
    }
    return cachedClient;
  }

  let client;
  try {
    client = Client.forTestnet();
  } catch (error) {
    throw new NetworkError("Unable to create the Hedera Testnet client.", { cause: error });
  }

  // Quiet by default; the SDK is chatty about retries.
  client.setLogger(new Logger(LogLevel.Error));
  client.setRequestTimeout(config.requestTimeoutMs);

  if (hasOperatorCredentials()) {
    const { accountId, privateKey } = requireOperatorCredentials();
    const key = parsePrivateKey(privateKey);
    client.setOperator(AccountId.fromString(accountId), key);
    cachedOperatorId = accountId;
  } else if (requireOperator) {
    client.close();
    throw new ConfigurationError(
      "Hedera operator credentials are missing. Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in blockchain/.env (see .env.example).",
      { code: "MISSING_CREDENTIALS" },
    );
  } else {
    cachedOperatorId = null;
  }

  // Always track the newest client so closeClient() can shut it down, even
  // when a script deliberately bypassed the cache with `fresh`.
  cachedClient = client;
  return client;
}

function getOperatorAccountId() {
  if (!hasOperatorCredentials()) {
    throw new ConfigurationError(
      "HEDERA_OPERATOR_ID is not configured.",
      { code: "MISSING_CREDENTIALS" },
    );
  }
  return AccountId.fromString(config.operatorId);
}

/** Public description of the signing identity - never includes key material. */
function describeOperator() {
  return {
    configured: hasOperatorCredentials(),
    accountId: hasOperatorCredentials() ? config.operatorId : null,
    network: config.network,
  };
}

function closeClient() {
  if (cachedClient) {
    cachedClient.close();
    cachedClient = null;
    cachedOperatorId = null;
  }
}

module.exports = {
  createClient,
  getOperatorAccountId,
  describeOperator,
  parsePrivateKey,
  closeClient,
};
