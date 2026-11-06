/**
 * LANDCHAIN blockchain - configuration.
 *
 * Every value comes from the environment (or blockchain/.env). Private keys are
 * only ever read here, never re-exported to callers and never logged.
 *
 * Hedera Testnet is the only supported network; anything else is refused at
 * client creation time.
 */
const path = require("path");
const { ConfigurationError } = require("./errors");

try {
  // Node >= 20.12 built-in .env loader, same approach as the backend module.
  process.loadEnvFile(path.join(__dirname, "..", ".env"));
} catch {
  // No .env file - rely on real environment variables.
}

const TESTNET = Object.freeze({
  name: "testnet",
  network: "testnet",
  chainId: 296,
  mirrorNodeUrl: "https://testnet.mirrornode.hedera.com",
  jsonRpcUrl: "https://testnet.hashio.io/api",
  explorerUrl: "https://hashscan.io/testnet",
});

function str(value, fallback = "") {
  const trimmed = String(value ?? "").trim();
  return trimmed.length ? trimmed : fallback;
}

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const network = str(process.env.HEDERA_NETWORK, TESTNET.name).toLowerCase();

/** Testnet endpoints, overridable for proxies but never for another network. */
const endpoints = Object.freeze({
  mirrorNodeUrl: str(process.env.HEDERA_MIRROR_NODE_URL, TESTNET.mirrorNodeUrl).replace(/\/+$/, ""),
  jsonRpcUrl: str(process.env.HEDERA_JSON_RPC_URL, TESTNET.jsonRpcUrl),
  explorerUrl: str(process.env.HEDERA_EXPLORER_URL, TESTNET.explorerUrl).replace(/\/+$/, ""),
  chainId: num(process.env.HEDERA_CHAIN_ID, TESTNET.chainId),
});

const config = {
  /** Only "testnet" is accepted (see assertTestnet). */
  network,
  chainId: endpoints.chainId,
  mirrorNodeUrl: endpoints.mirrorNodeUrl,
  jsonRpcUrl: endpoints.jsonRpcUrl,
  explorerUrl: endpoints.explorerUrl,

  /** Server-side signing account. HEDERA_OPERATOR_KEY is never exposed. */
  operatorId: str(process.env.HEDERA_OPERATOR_ID),
  operatorKey: str(process.env.HEDERA_OPERATOR_KEY),
  operatorEvmKey: str(process.env.HEDERA_OPERATOR_EVM_KEY),

  /** Optional distinct role keys; fall back to the operator key. */
  adminKey: str(process.env.HEDERA_VERIFIER_KEY) || str(process.env.HEDERA_ADMIN_KEY),
  verifierKey: str(process.env.HEDERA_VERIFIER_KEY),

  contracts: Object.freeze({
    propertyRegistry: str(process.env.PROPERTY_REGISTRY_ADDRESS),
    investmentPool: str(process.env.INVESTMENT_POOL_ADDRESS),
    tokenAllocation: str(process.env.TOKEN_ALLOCATION_ADDRESS),
    resale: str(process.env.RESALE_CONTRACT_ADDRESS),
  }),

  topicId: str(process.env.HEDERA_PROPERTY_TOPIC_ID),
  hcsMaxFeeTinybar: num(process.env.HCS_MAX_FEE_TINYBAR, 200_000_000),
  tokenDecimals: num(process.env.HTS_TOKEN_DECIMALS, 0),
  requestTimeoutMs: num(process.env.HEDERA_REQUEST_TIMEOUT_MS, 20_000),
};

/** Throws unless the configured network is Hedera Testnet. */
function assertTestnet() {
  if (config.network !== TESTNET.name) {
    throw new ConfigurationError(
      `Refusing to run against "${config.network}". LANDCHAIN blockchain integration is Hedera Testnet only.`,
      { code: "NETWORK_NOT_ALLOWED" },
    );
  }
  if (config.chainId !== TESTNET.chainId) {
    throw new ConfigurationError(
      `HEDERA_CHAIN_ID must be ${TESTNET.chainId} (Hedera Testnet), received ${config.chainId}.`,
      { code: "NETWORK_NOT_ALLOWED" },
    );
  }
}

function hasOperatorCredentials() {
  return Boolean(config.operatorId && config.operatorKey);
}

function requireOperatorCredentials() {
  if (!hasOperatorCredentials()) {
    throw new ConfigurationError(
      "Hedera operator credentials are missing. Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in blockchain/.env (see .env.example).",
      { code: "MISSING_CREDENTIALS" },
    );
  }
  return { accountId: config.operatorId, privateKey: config.operatorKey };
}

/** Contract address lookup with a helpful error instead of `undefined`. */
function contractAddress(name) {
  const address = config.contracts[name];
  if (!address) {
    const envName = {
      propertyRegistry: "PROPERTY_REGISTRY_ADDRESS",
      investmentPool: "INVESTMENT_POOL_ADDRESS",
      tokenAllocation: "TOKEN_ALLOCATION_ADDRESS",
      resale: "RESALE_CONTRACT_ADDRESS",
    }[name];
    throw new ConfigurationError(
      `No address configured for "${name}". Deploy first (npm run deploy:testnet) and set ${envName}.`,
      { code: "MISSING_CONTRACT_ADDRESS" },
    );
  }
  return address;
}

module.exports = {
  config,
  TESTNET,
  assertTestnet,
  hasOperatorCredentials,
  requireOperatorCredentials,
  contractAddress,
};
