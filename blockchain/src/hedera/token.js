/**
 * Hedera Token Service (HTS).
 *
 * One fungible HTS token per property. Units are whole numbers (decimals = 0),
 * the supply is finite and equal to the property's total units, and the whole
 * supply starts in the treasury (the LANDCHAIN operator account). Allocation is
 * a treasury -> investor transfer; resale settlement is investor -> investor
 * through the escrow flow in the Solidity layer.
 *
 * HTS requires the receiving account to be associated with the token. The
 * service checks that up front and returns an actionable error instead of an
 * opaque TOKEN_NOT_ASSOCIATED_TO_ACCOUNT receipt.
 */
const {
  TokenCreateTransaction,
  TokenAssociateTransaction,
  TransferTransaction,
  TokenType,
  TokenSupplyType,
  AccountId,
  Hbar,
} = require("@hashgraph/sdk");
const { config } = require("../config");
const { createClient, getOperatorAccountId, parsePrivateKey } = require("./client");
const { ValidationError, TransactionError } = require("../errors");
const { explorer } = require("../utils/explorer");
const validation = require("../utils/validation");

class TokenService {
  constructor({ client, mirror } = {}) {
    this._client = client || null;
    this._mirror = mirror || null;
  }

  client() {
    if (!this._client) this._client = createClient({ requireOperator: true });
    return this._client;
  }

  mirror() {
    if (!this._mirror) {
      const { MirrorNodeClient } = require("./mirror");
      this._mirror = new MirrorNodeClient();
    }
    return this._mirror;
  }

  /**
   * Create the property-specific investment token.
   * @param {object} params
   * @param {string} params.propertyId LANDCHAIN property ID
   * @param {string} params.name token name (<= 100 chars)
   * @param {string} params.symbol token symbol (2-32 uppercase alnum)
   * @param {number} params.totalUnits finite supply
   */
  async createPropertyToken({ propertyId, name, symbol, totalUnits }) {
    const id = validation.propertyId(propertyId);
    const supply = validation.units(totalUnits, "totalUnits");
    const tokenName = validation.tokenName(name || `LANDCHAIN ${id} Units`);
    const tokenSymbol = validation.tokenSymbol(symbol);
    const client = this.client();

    const treasury = getOperatorAccountId();
    const operatorKey = client.operatorPublicKey;

    const transaction = new TokenCreateTransaction()
      .setTokenName(tokenName)
      .setTokenSymbol(tokenSymbol)
      .setDecimals(config.tokenDecimals)
      .setTokenType(TokenType.FungibleCommon)
      .setSupplyType(TokenSupplyType.Finite)
      .setMaxSupply(supply)
      .setInitialSupply(supply)
      .setTreasuryAccountId(treasury)
      .setAdminKey(operatorKey)
      .setSupplyKey(operatorKey)
      .setFreezeDefault(false)
      .setTokenMemo(`LANDCHAIN property ${id}`.slice(0, 100))
      .setMaxTransactionFee(new Hbar(50));

    let response;
    try {
      response = await transaction.execute(client);
      const receipt = await response.getReceipt(client);
      const tokenId = receipt.tokenId?.toString();
      if (!tokenId) {
        throw new TransactionError("Token creation did not return a token ID.");
      }
      return {
        propertyId: id,
        tokenId,
        name: tokenName,
        symbol: tokenSymbol,
        decimals: config.tokenDecimals,
        totalSupply: String(supply),
        treasuryAccountId: treasury.toString(),
        transactionId: response.transactionId.toString(),
        status: receipt.status.toString(),
        explorerUrl: explorer.token(tokenId),
      };
    } catch (error) {
      if (error instanceof TransactionError) throw error;
      throw new TransactionError(`Token creation failed: ${error.message}`, { cause: error });
    }
  }

  /** True when the account is associated with the token (zero balance counts). */
  async isAssociated(tokenId, accountId) {
    const tokens = await this.mirror().getAccountTokens(accountId);
    return tokens.some((entry) => entry.tokenId === tokenId);
  }

  async assertAssociated(tokenId, accountId, role = "receiving account") {
    const associated = await this.isAssociated(tokenId, accountId);
    if (!associated) {
      throw new ValidationError(
        `${accountId} is not associated with token ${tokenId}. The ${role} must associate the token from their Hedera wallet before units can be allocated or received.`,
        { code: "TOKEN_NOT_ASSOCIATED", details: { tokenId, accountId } },
      );
    }
  }

  /**
   * Associate an account with a token. Only usable when the signing key for that
   * account is available server-side; investor wallets self-sign instead.
   */
  async associateToken({ tokenId, accountId, privateKey }) {
    const client = this.client();
    const target = validation.accountId(accountId);
    const transaction = new TokenAssociateTransaction()
      .setAccountId(target)
      .setTokenIds([tokenId]);

    if (target !== getOperatorAccountId().toString()) {
      if (!privateKey) {
        throw new ValidationError(
          "Associating an external account requires that account's own key. Investors associate from their wallet.",
          { code: "SIGNATURE_REQUIRED" },
        );
      }
      transaction.freezeWith(client);
      transaction.sign(parsePrivateKey(privateKey, "accountKey"));
    }

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);
    return {
      tokenId,
      accountId: target,
      transactionId: response.transactionId.toString(),
      status: receipt.status.toString(),
      explorerUrl: explorer.transaction(response.transactionId.toString()),
    };
  }

  async _transfer({ tokenId, fromAccountId, toAccountId, units, signerKey }) {
    const client = this.client();
    const from = validation.accountId(fromAccountId, "fromAccountId");
    const to = validation.accountId(toAccountId, "toAccountId");
    const amount = validation.units(units);
    if (from === to) throw new ValidationError("fromAccountId and toAccountId must differ.");

    const operatorId = getOperatorAccountId().toString();
    if (from !== operatorId && !signerKey) {
      throw new ValidationError(
        "HTS transfers must be signed by the token owner. Server-side transfers can only move units held by the operator account.",
        { code: "SIGNATURE_REQUIRED" },
      );
    }

    await this.assertAssociated(tokenId, to, "receiver");

    let transaction = new TransferTransaction()
      .addTokenTransfer(tokenId, AccountId.fromString(from), -amount)
      .addTokenTransfer(tokenId, AccountId.fromString(to), amount)
      .setTransactionMemo(`LANDCHAIN units ${amount}`);

    if (from !== operatorId && signerKey) {
      transaction.freezeWith(client);
      transaction.sign(parsePrivateKey(signerKey, "signerKey"));
    }

    try {
      const response = await transaction.execute(client);
      const receipt = await response.getReceipt(client);
      return {
        tokenId,
        fromAccountId: from,
        toAccountId: to,
        units: amount,
        transactionId: response.transactionId.toString(),
        status: receipt.status.toString(),
        explorerUrl: explorer.transaction(response.transactionId.toString()),
      };
    } catch (error) {
      throw new TransactionError(`Token transfer failed: ${error.message}`, { cause: error });
    }
  }

  /** Move units out of the treasury (initial allocation to an investor). */
  async allocateUnits({ tokenId, toAccountId, units }) {
    return this._transfer({
      tokenId,
      fromAccountId: getOperatorAccountId().toString(),
      toAccountId,
      units,
    });
  }

  /** Move units already held by an investor (resale settlement / treasury buyback). */
  async transferUnits({ tokenId, fromAccountId, toAccountId, units, signerKey }) {
    return this._transfer({ tokenId, fromAccountId, toAccountId, units, signerKey });
  }

  /** Read a token balance from the mirror node. */
  async getTokenBalance({ tokenId, accountId }) {
    const id = validation.entityId(tokenId, "tokenId");
    const account = validation.accountId(accountId);
    const balance = await this.mirror().getTokenBalance(id, account);
    return {
      tokenId: id,
      accountId: account,
      units: balance,
      decimals: config.tokenDecimals,
      explorerUrl: explorer.token(id),
    };
  }

  /** Token metadata from the mirror node. */
  async getTokenInfo(tokenId) {
    const id = validation.entityId(tokenId, "tokenId");
    return this.mirror().getToken(id);
  }
}

module.exports = { TokenService };
