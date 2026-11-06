/**
 * Hedera Mirror Node client (REST, no credentials required).
 *
 * Used for every read path: account lookup, balances, token metadata,
 * transaction lookup/status and the append-only HCS message history. Writes go
 * through the SDK; reads here are free and never touch the operator key.
 */
const { config } = require("../config");
const { NetworkError, NotFoundError, ValidationError } = require("../errors");
const { explorer } = require("../utils/explorer");

/** 0.0.x@sss.nnn / 0.0.x-sss-nnn -> the dash form the mirror node expects. */
function normalizeTransactionId(value) {
  const text = String(value ?? "").trim();
  const withAt = /^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/.exec(text);
  if (withAt) return `${withAt[1]}-${withAt[2]}-${withAt[3]}`;
  const dash = /^(\d+\.\d+\.\d+)-(\d+)-(\d+)$/.exec(text);
  if (dash) return text;
  return null;
}

function tinybarToHbar(tinybar) {
  return Number((Number(tinybar || 0) / 100_000_000).toFixed(8));
}

class MirrorNodeClient {
  constructor({ baseUrl = config.mirrorNodeUrl, timeoutMs = config.requestTimeoutMs } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
  }

  async request(path, params = {}) {
    const url = new URL(`${this.baseUrl}/api/v1${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    let response;
    try {
      response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new NetworkError(`Mirror node request failed: ${url.pathname}`, {
        cause: error,
        details: { path: url.pathname },
      });
    }

    if (response.status === 404) {
      throw new NotFoundError(`Mirror node has no record at ${url.pathname}.`, {
        details: { path: url.pathname },
      });
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new NetworkError(
        `Mirror node returned ${response.status} for ${url.pathname}.`,
        { details: { status: response.status, body: body.slice(0, 300) } },
      );
    }
    return response.json();
  }

  /** Account info by Hedera ID or EVM alias. */
  async getAccount(accountId) {
    const id = String(accountId ?? "").trim();
    if (!/^0\.0\.\d{1,10}$/.test(id) && !/^0x[0-9a-fA-F]{40}$/.test(id)) {
      throw new ValidationError("accountId must be a Hedera account ID or an EVM address.");
    }
    const data = await this.request(`/accounts/${id}`);
    return {
      accountId: data.account,
      alias: data.alias ?? null,
      evmAddress: data.evm_address ?? null,
      key: data.key?.key ?? null,
      keyType: data.key?._type ?? null,
      balanceTinybar: Number(data.balance?.balance ?? 0),
      balanceHbar: tinybarToHbar(data.balance?.balance),
      receiverSignatureRequired: Boolean(data.receiver_sig_required),
      deleted: Boolean(data.deleted),
      memo: data.memo ?? "",
      createdTimestamp: data.created_timestamp ?? null,
      expiryTimestamp: data.expiry_timestamp ?? null,
      explorerUrl: explorer.account(data.account),
    };
  }

  /** Token associations and balances for an account. */
  async getAccountTokens(accountId, { limit = 100 } = {}) {
    const data = await this.request(`/accounts/${accountId}/tokens`, { limit });
    return (data.tokens ?? []).map((entry) => ({
      tokenId: entry.token_id,
      balance: Number(entry.balance),
      decimals: Number(entry.decimals ?? 0),
      createdTimestamp: entry.created_timestamp ?? null,
    }));
  }

  /** Balance of one token for one account (404 when not associated). */
  async getTokenBalance(tokenId, accountId) {
    try {
      const data = await this.request(`/accounts/${accountId}/tokens/${tokenId}`);
      return Number(data.balance ?? 0);
    } catch (error) {
      if (error instanceof NotFoundError) return 0;
      throw error;
    }
  }

  async getToken(tokenId) {
    const data = await this.request(`/tokens/${tokenId}`);
    return {
      tokenId: data.token_id,
      name: data.name,
      symbol: data.symbol,
      decimals: Number(data.decimals ?? 0),
      totalSupply: String(data.total_supply ?? "0"),
      initialSupply: String(data.initial_supply ?? "0"),
      maxSupply: String(data.max_supply ?? "0"),
      type: data.type,
      supplyType: data.supply_type,
      treasuryAccountId: data.treasury_account_id ?? null,
      memo: data.memo ?? "",
      createdTimestamp: data.created_timestamp ?? null,
      paused: Boolean(data.paused),
      explorerUrl: explorer.token(data.token_id),
    };
  }

  /**
   * Transaction lookup. Accepts a Hedera transaction ID (`0.0.x@sss.nnn` or
   * `0.0.x-sss-nnn`) or an EVM transaction hash (`0x` + 64 hex).
   */
  async getTransaction(reference) {
    const ref = String(reference ?? "").trim();

    if (/^0x[0-9a-fA-F]{64}$/.test(ref)) {
      const result = await this.request(`/contracts/results/${ref.toLowerCase()}`);
      const success = result.status === "0x1";
      return {
        kind: "evm",
        transactionId: result.transaction_id ?? null,
        transactionHash: ref.toLowerCase(),
        contractId: result.contract_id ?? null,
        from: result.from ?? null,
        to: result.to ?? null,
        status: success ? "SUCCESS" : `FAILED (${result.status})`,
        success,
        gasUsed: result.gas_used ?? null,
        result: result.result ?? null,
        consensusTimestamp: result.timestamp ?? null,
        explorerUrl: explorer.transaction(ref),
      };
    }

    const normalized = normalizeTransactionId(ref);
    if (!normalized) {
      throw new ValidationError(
        "Transaction reference must be a Hedera transaction ID (0.0.x@sss.nnn) or an EVM hash (0x + 64 hex).",
      );
    }

    const data = await this.request(`/transactions/${normalized}`);
    const entry = (data.transactions ?? [])[0];
    if (!entry) {
      throw new NotFoundError(`Transaction ${normalized} was not found.`);
    }
    const success = entry.result === "SUCCESS";
    return {
      kind: "hedera",
      transactionId: entry.transaction_id,
      transactionHash: entry.transaction_hash ?? null,
      type: entry.name ?? null,
      status: entry.result ?? "UNKNOWN",
      success,
      consensusTimestamp: entry.consensus_timestamp ?? null,
      validStartTimestamp: entry.valid_start_timestamp ?? null,
      chargedFeeTinybar: Number(entry.charged_tx_fee ?? 0),
      memo: entry.memo ?? "",
      node: entry.node ?? null,
      transfers: (entry.transfers ?? []).map((transfer) => ({
        accountId: transfer.account,
        amountTinybar: Number(transfer.amount ?? 0),
      })),
      explorerUrl: explorer.transaction(entry.transaction_id),
    };
  }

  /**
   * Recent transactions for an account, newest first.
   * The mirror node exposes this through `/transactions?account.id=...`; the
   * `/accounts/{id}/transactions` sub-resource returns 404 on Hedera Testnet.
   */
  async getAccountTransactions(accountId, { limit = 25, order = "desc" } = {}) {
    const data = await this.request(`/transactions`, {
      "account.id": accountId,
      limit,
      order,
    });
    return (data.transactions ?? []).map((entry) => ({
      transactionId: entry.transaction_id,
      type: entry.name ?? null,
      status: entry.result ?? "UNKNOWN",
      success: entry.result === "SUCCESS",
      consensusTimestamp: entry.consensus_timestamp ?? null,
      chargedFeeTinybar: Number(entry.charged_tx_fee ?? 0),
      memo: entry.memo ?? "",
      explorerUrl: explorer.transaction(entry.transaction_id),
    }));
  }

  /** Decode one HCS message body: JSON when possible, UTF-8 otherwise. */
  decodeMessage(base64) {
    const text = Buffer.from(base64, "base64").toString("utf8");
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }

  /** Append-only topic history, oldest first by default. */
  async getTopicMessages(topicId, { limit = 25, order = "asc", sequenceNumber } = {}) {
    if (!/^0\.0\.\d{1,10}$/.test(String(topicId))) {
      throw new ValidationError("topicId must be a Hedera topic ID (0.0.x).");
    }
    const data = await this.request(`/topics/${topicId}/messages`, {
      limit,
      order,
      sequencenumber: sequenceNumber ? `gte:${sequenceNumber}` : undefined,
    });

    return (data.messages ?? []).map((message) => ({
      topicId: message.topic_id,
      sequenceNumber: Number(message.sequence_number),
      consensusTimestamp: message.consensus_timestamp,
      payerAccountId: message.payer_account_id ?? null,
      payload: this.decodeMessage(message.message),
      explorerUrl: explorer.topicMessage(message.topic_id, message.sequence_number),
    }));
  }

  async getTopic(topicId) {
    const data = await this.request(`/topics/${topicId}`);
    return {
      topicId: data.topic_id,
      memo: data.memo ?? "",
      adminKey: data.admin_key?.key ?? null,
      submitKey: data.submit_key?.key ?? null,
      createdTimestamp: data.created_timestamp ?? null,
      explorerUrl: explorer.topic(data.topic_id),
    };
  }

  /** HBAR price feed - handy for showing testnet costs in the UI. */
  async getExchangeRate() {
    const data = await this.request("/network/exchangerate");
    const current = data.current_rate ?? {};
    return {
      hbarToUsd: Number(current.cent_equivalent ?? 0) / Number(current.hbar_equivalent ?? 1) / 100,
      expiresAt: data.next_expiry ?? null,
    };
  }
}

module.exports = { MirrorNodeClient, normalizeTransactionId, tinybarToHbar };
