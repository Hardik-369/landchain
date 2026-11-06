/**
 * Hedera Smart Contract Service (HSC) client.
 *
 * Solidity contracts are called through the Hedera JSON-RPC relay with ethers.
 * Every write waits for the receipt, so callers only ever receive a real
 * transaction hash and a confirmed status.
 */
const fs = require("node:fs");
const path = require("node:path");
const { JsonRpcProvider, Wallet, Contract, isAddress } = require("ethers");
const { config } = require("../config");
const { ConfigurationError, TransactionError, ValidationError } = require("../errors");
const { explorer } = require("../utils/explorer");

const ARTIFACT_ROOT = path.join(__dirname, "..", "..", "artifacts", "contracts");

const CONTRACT_NAMES = Object.freeze({
  propertyRegistry: "PropertyRegistry",
  investmentPool: "InvestmentPool",
  tokenAllocation: "TokenAllocation",
  resale: "ResaleContract",
});

/** Read a compiled artifact produced by `npm run compile`. */
function readArtifact(contractName) {
  const file = path.join(ARTIFACT_ROOT, `${contractName}.sol`, `${contractName}.json`);
  if (!fs.existsSync(file)) {
    throw new ConfigurationError(
      `Missing artifact for ${contractName}. Run "npm run compile" inside /blockchain first.`,
      { code: "ARTIFACT_NOT_FOUND" },
    );
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalizeEvmKey(raw, label = "HEDERA_OPERATOR_EVM_KEY") {
  const text = String(raw ?? "").trim();
  if (!text) {
    throw new ConfigurationError(`${label} is not set.`, { code: "MISSING_CREDENTIALS" });
  }
  const hex = text.startsWith("0x") ? text.slice(2) : text;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new ConfigurationError(
      `${label} must be a 32-byte hex private key (0x + 64 hex characters) for the Hedera JSON-RPC relay.`,
      { code: "INVALID_KEY" },
    );
  }
  return `0x${hex}`;
}

class ContractsClient {
  constructor({
    addresses = config.contracts,
    rpcUrl = config.jsonRpcUrl,
    privateKey = config.operatorEvmKey,
    chainId = config.chainId,
  } = {}) {
    this.addresses = addresses;
    this.rpcUrl = rpcUrl;
    this.chainId = chainId;
    this._privateKey = privateKey || null;
    this._provider = null;
    this._signer = null;
    this._contracts = new Map();
  }

  /** A copy of this client that signs with a different key (never from HTTP input). */
  withSigner(privateKey) {
    return new ContractsClient({
      addresses: this.addresses,
      rpcUrl: this.rpcUrl,
      privateKey,
      chainId: this.chainId,
    });
  }

  provider() {
    if (!this._provider) {
      this._provider = new JsonRpcProvider(this.rpcUrl, this.chainId, {
        staticNetwork: true,
      });
    }
    return this._provider;
  }

  signer() {
    if (!this._signer) {
      const key = normalizeEvmKey(this._privateKey);
      this._signer = new Wallet(key, this.provider());
    }
    return this._signer;
  }

  address(name) {
    const address = this.addresses?.[name];
    if (!address || !isAddress(address)) {
      throw new ConfigurationError(`No valid deployed address configured for "${name}".`, {
        code: "MISSING_CONTRACT_ADDRESS",
      });
    }
    return address;
  }

  contract(name) {
    if (!this._contracts.has(name)) {
      const artifact = readArtifact(CONTRACT_NAMES[name] ?? name);
      const runner = this._privateKey ? this.signer() : this.provider();
      this._contracts.set(name, new Contract(this.address(name), artifact.abi, runner));
    }
    return this._contracts.get(name);
  }

  /** Read-only call - no gas, no signature. */
  async call(name, method, args = []) {
    try {
      const contract = this.contract(name);
      if (typeof contract[method] !== "function") {
        throw new ValidationError(`Unknown ${name} method "${method}".`);
      }
      return await contract[method](...args);
    } catch (error) {
      throw this._wrap(error, `${name}.${method}() read failed`);
    }
  }

  /** State-changing call: estimate, send, wait for the receipt. */
  async send(name, method, args = []) {
    if (!this._privateKey) {
      throw new ConfigurationError(
        "A signing key (HEDERA_OPERATOR_EVM_KEY) is required for contract writes.",
        { code: "MISSING_CREDENTIALS" },
      );
    }
    const contract = this.contract(name);
    const fn = contract[method];
    if (typeof fn !== "function") {
      throw new ValidationError(`Unknown ${name} method "${method}".`);
    }

    let gasLimit;
    try {
      const estimated = await fn.estimateGas(...args);
      // Hedera can under-estimate slightly; add 30% and stay under the 15M cap.
      gasLimit = (estimated * 13n) / 10n;
      if (gasLimit > 15_000_000n) gasLimit = 15_000_000n;
    } catch (error) {
      // Estimation frequently fails when the call would revert - let the wrapped
      // error explain why instead of sending a transaction that burns gas.
      throw this._wrap(error, `${name}.${method}() is not executable`);
    }

    try {
      const tx = await fn(...args, { gasLimit });
      const receipt = await tx.wait();
      if (!receipt) {
        throw new TransactionError(`${name}.${method}() produced no receipt.`);
      }
      const success = receipt.status === 1;
      const events = [];
      for (const log of receipt.logs ?? []) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed) {
            events.push({
              event: parsed.name,
              args: parsed.args.toObject(),
            });
          }
        } catch {
          // Log from another contract - ignore.
        }
      }
      return {
        contract: name,
        method,
        transactionHash: receipt.hash,
        status: success ? "SUCCESS" : "FAILED",
        success,
        blockNumber: receipt.blockNumber,
        gasUsed: Number(receipt.gasUsed),
        explorerUrl: explorer.transaction(receipt.hash),
        events,
      };
    } catch (error) {
      throw this._wrap(error, `${name}.${method}() transaction failed`);
    }
  }

  _wrap(error, context) {
    if (error instanceof ConfigurationError || error instanceof ValidationError) return error;
    if (error instanceof TransactionError) return error;
    const reason =
      error?.revert?.name ||
      error?.reason ||
      error?.shortMessage ||
      error?.info?.error?.message ||
      error?.message ||
      "unknown error";
    return new TransactionError(`${context}: ${reason}`, {
      cause: error,
      code: "CONTRACT_CALL_FAILED",
      details: { data: error?.data ?? error?.info?.error?.data ?? null },
    });
  }
}

module.exports = { ContractsClient, readArtifact, normalizeEvmKey, CONTRACT_NAMES };
