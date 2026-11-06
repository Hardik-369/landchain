/**
 * LANDCHAIN blockchain module - public API.
 *
 * The backend (Contributor 2) only needs this entry point:
 *
 *   const { getBlockchainService } = require("./blockchain/src");
 *   const service = getBlockchainService();
 *   await service.registerProperty({ propertyId, propertyHash });
 *
 * Or mount the ready-made Express adapter:
 *
 *   app.use("/api/blockchain", createBlockchainRouter(express));
 */
const { BlockchainService, getBlockchainService } = require("./services/blockchain.service");
const { MirrorNodeClient } = require("./hedera/mirror");
const { ConsensusService } = require("./hedera/consensus");
const { TokenService } = require("./hedera/token");
const { ContractsClient } = require("./hedera/contracts");
const { WalletService, HEDERA_TESTNET_CHAIN } = require("./hedera/wallet");
const { createClient, closeClient, describeOperator } = require("./hedera/client");
const { createBlockchainRouter } = require("./api/router");
const { config, TESTNET, assertTestnet, hasOperatorCredentials } = require("./config");
const errors = require("./errors");
const { sha256Hex, toBytes32, fromBytes32, canonicalize, hashDocument } = require("./utils/hash");

module.exports = {
  // Service
  BlockchainService,
  getBlockchainService,

  // Building blocks (for tests and advanced integrations)
  MirrorNodeClient,
  ConsensusService,
  TokenService,
  ContractsClient,
  WalletService,
  HEDERA_TESTNET_CHAIN,
  createClient,
  closeClient,
  describeOperator,

  // Express adapter
  createBlockchainRouter,

  // Config & guards
  config,
  TESTNET,
  assertTestnet,
  hasOperatorCredentials,

  // Errors
  ...errors,

  // Hash helpers (compatible with backend/src/lib/hash.js)
  sha256Hex,
  toBytes32,
  fromBytes32,
  canonicalize,
  hashDocument,
};
