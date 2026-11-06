/**
 * Hedera wallet integration.
 *
 * Two entry points:
 *  - `connectWallet()` / `getAccountInfo()` - resolve a Hedera account ID or an
 *    EVM alias address against Hedera Testnet and read its state from the mirror
 *    node. Works with any Hedera-compatible wallet (HashPack, Blade, MetaMask
 *    via the Hedera JSON-RPC relay).
 *  - `connectBrowserWallet()` - an EIP-1193 flow for the frontend: switch the
 *    wallet to Hedera Testnet (chain 296), request accounts and return the
 *    resolved Hedera account.
 *
 * No function here ever accepts or returns a private key.
 */
const { TransferTransaction, AccountId, Hbar, HbarUnit } = require("@hashgraph/sdk");
const { config, TESTNET } = require("../config");
const { ValidationError, NotFoundError, TransactionError } = require("../errors");
const { explorer } = require("../utils/explorer");
const { createClient, getOperatorAccountId } = require("./client");
const validation = require("../utils/validation");

/** The chain parameters a browser wallet needs to add Hedera Testnet. */
const HEDERA_TESTNET_CHAIN = Object.freeze({
  chainId: "0x128", // 296
  chainName: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 8 },
  rpcUrls: [config.jsonRpcUrl],
  blockExplorerUrls: [config.explorerUrl],
});

class WalletService {
  constructor({ mirror } = {}) {
    this._mirror = mirror || null;
  }

  mirror() {
    if (!this._mirror) {
      const { MirrorNodeClient } = require("./mirror");
      this._mirror = new MirrorNodeClient();
    }
    return this._mirror;
  }

  /**
   * Connect to Hedera Testnet and return the account state.
   * @param {string} accountId Hedera account ID (0.0.x) or EVM address alias
   */
  async connectWallet({ accountId }) {
    const input = validation.accountId(accountId);
    const account = await this.mirror().getAccount(input);

    if (account.deleted) {
      throw new ValidationError(`Account ${account.accountId} has been deleted on Hedera Testnet.`);
    }

    return {
      connected: true,
      network: TESTNET.name,
      chainId: TESTNET.chainId,
      accountId: account.accountId,
      evmAddress: account.evmAddress,
      balanceHbar: account.balanceHbar,
      balanceTinybar: account.balanceTinybar,
      receiverSignatureRequired: account.receiverSignatureRequired,
      createdAt: account.createdTimestamp,
      explorerUrl: account.explorerUrl,
    };
  }

  /** Read wallet address, key type and balances. */
  async getAccountInfo(accountId) {
    return this.connectWallet({ accountId });
  }

  async checkAccount(accountId) {
    try {
      const info = await this.connectWallet({ accountId });
      return { exists: true, ...info };
    } catch (error) {
      if (error instanceof NotFoundError) {
        return {
          exists: false,
          accountId: String(accountId),
          network: TESTNET.name,
          reason: "Account is not registered on Hedera Testnet yet.",
        };
      }
      throw error;
    }
  }

  /**
   * The Solidity ledger uses EVM addresses. Hedera long-zero accounts map to
   * 0x00000000000000000000000000000000000000<accountNum>; alias accounts use
   * their real EVM address. The mirror node is the source of truth.
   */
  async resolveLedgerAddress(accountId) {
    const input = validation.accountId(accountId);
    if (/^0x[0-9a-fA-F]{40}$/.test(input)) return input.toLowerCase();
    const account = await this.mirror().getAccount(input);
    if (!account.evmAddress) {
      throw new ValidationError(
        `Hedera account ${input} has no EVM address yet. Create an EVM alias or use the account's Hedera ID in a wallet that exposes one.`,
      );
    }
    return account.evmAddress.toLowerCase();
  }

  /** Resolve either identifier form to the canonical Hedera account ID. */
  async resolveAccountId(accountIdOrAddress) {
    const input = validation.accountId(accountIdOrAddress);
    if (/^0\.0\.\d+$/.test(input)) return input;
    const account = await this.mirror().getAccount(input);
    return account.accountId;
  }

  /**
   * Browser wallet flow (chain switch + account request).
   * @param {object} params
   * @param {object} params.provider EIP-1193 provider, defaults to window.ethereum
   */
  async connectBrowserWallet({ provider } = {}) {
    const injected = provider ?? (typeof globalThis !== "undefined" ? globalThis.ethereum : undefined);
    if (!injected?.request) {
      throw new ValidationError(
        "No EIP-1193 wallet detected. Install HashPack, Blade or MetaMask, or pass a provider.",
      );
    }

    const currentChainId = await injected.request({ method: "eth_chainId" });
    if (String(currentChainId).toLowerCase() !== HEDERA_TESTNET_CHAIN.chainId) {
      try {
        await injected.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: HEDERA_TESTNET_CHAIN.chainId }],
        });
      } catch (switchError) {
        // 4902 = chain not added to the wallet yet.
        if (switchError?.code === 4902 || switchError?.code === -32603) {
          await injected.request({
            method: "wallet_addEthereumChain",
            params: [HEDERA_TESTNET_CHAIN],
          });
        } else {
          throw new ValidationError(
            `Wallet is not on Hedera Testnet (chain ${TESTNET.chainId}). Switch networks and retry.`,
            { code: "WRONG_NETWORK", cause: switchError },
          );
        }
      }
    }

    const accounts = await injected.request({ method: "eth_requestAccounts" });
    const address = Array.isArray(accounts) ? accounts[0] : null;
    if (!address) throw new ValidationError("The wallet did not return an account.");

    const info = await this.connectWallet({ accountId: address });
    return { ...info, walletAddress: address, providerChainId: HEDERA_TESTNET_CHAIN.chainId };
  }

  /** Send HBAR from the operator account (testnet payouts, faucet top-ups). */
  async transferHbar({ toAccountId, amountHbar, memo }) {
    const to = validation.accountId(toAccountId, "toAccountId");
    const amount = Number(amountHbar);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ValidationError("amountHbar must be a positive number.");
    }

    const client = createClient({ requireOperator: true });
    const transaction = new TransferTransaction()
      .addHbarTransfer(getOperatorAccountId(), Hbar.from(-amount, HbarUnit.Hbar))
      .addHbarTransfer(AccountId.fromString(to), Hbar.from(amount, HbarUnit.Hbar))
      .setMaxTransactionFee(new Hbar(2));
    if (memo) transaction.setTransactionMemo(String(memo).slice(0, 100));

    try {
      const response = await transaction.execute(client);
      const receipt = await response.getReceipt(client);
      return {
        fromAccountId: getOperatorAccountId().toString(),
        toAccountId: to,
        amountHbar: amount,
        transactionId: response.transactionId.toString(),
        status: receipt.status.toString(),
        explorerUrl: explorer.transaction(response.transactionId.toString()),
      };
    } catch (error) {
      throw new TransactionError(`HBAR transfer failed: ${error.message}`, { cause: error });
    }
  }
}

module.exports = { WalletService, HEDERA_TESTNET_CHAIN };
