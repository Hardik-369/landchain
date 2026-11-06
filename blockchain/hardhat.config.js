/**
 * Hardhat configuration.
 *
 * `hardhat` network  -> local in-memory EVM, used by the contract tests.
 * `hederaTestnet`   -> Hedera Smart Contract Service through the JSON-RPC relay.
 *
 * Hedera mainnet is deliberately absent: the integration is testnet-only.
 */
const path = require("node:path");
require("@nomicfoundation/hardhat-ethers");
const { config: loadConfig } = require("./src/config");

// Load blockchain/.env once for Hardhat and the scripts (never logs values).
try {
  process.loadEnvFile(path.join(__dirname, ".env"));
} catch {
  // .env is optional - CI and Hardhat tests run without it.
}

const deployerKey = process.env.HEDERA_OPERATOR_EVM_KEY
  ? process.env.HEDERA_OPERATOR_EVM_KEY.startsWith("0x")
    ? process.env.HEDERA_OPERATOR_EVM_KEY
    : `0x${process.env.HEDERA_OPERATOR_EVM_KEY}`
  : null;

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Paris avoids PUSH0 opcodes, which keeps the bytecode within the
      // opcode set Hedera's EVM reliably executes.
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      allowUnlimitedContractSize: false,
    },
    hederaTestnet: {
      url: loadConfig.jsonRpcUrl,
      chainId: loadConfig.chainId,
      accounts: deployerKey ? [deployerKey] : [],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test/contracts",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 120_000,
  },
};
