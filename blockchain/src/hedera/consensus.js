/**
 * Hedera Consensus Service (HCS).
 *
 * Every property activity is written to one topic as an immutable, ordered
 * message. The topic has a submit key (the operator), so nobody else can append
 * to the LANDCHAIN log, and messages can never be edited or deleted.
 *
 * Message schema (kept small - HCS caps a message at 1024 bytes):
 * {
 *   v: 1,
 *   type: "property_registered" | "document_verified" | "investment" | ...,
 *   propertyId: "LAND-2026-001",
 *   actor: "0.0.1234",
 *   timestamp: "2026-11-07T10:00:00.000Z",
 *   data: { ... }
 * }
 */
const { TopicCreateTransaction, TopicMessageSubmitTransaction, Hbar, HbarUnit } = require("@hashgraph/sdk");
const { config } = require("../config");
const { createClient, getOperatorAccountId } = require("./client");
const { ValidationError, TransactionError } = require("../errors");
const { explorer } = require("../utils/explorer");
const { requiredString, eventType, propertyId: parsePropertyId, hcsPayloadSize } = require("../utils/validation");

const MESSAGE_VERSION = 1;
const MAX_MESSAGE_BYTES = 1024;

function assertTopicId(topicId) {
  if (!/^0\.0\.\d{1,10}$/.test(String(topicId))) {
    throw new ValidationError("A Hedera topic ID (0.0.x) is required. Run `npm run topic:create`.");
  }
  return String(topicId);
}

class ConsensusService {
  constructor({ topicId = config.topicId, client } = {}) {
    this.topicId = topicId || null;
    this._client = client || null;
  }

  client() {
    if (!this._client) this._client = createClient({ requireOperator: true });
    return this._client;
  }

  /**
   * Create the LANDCHAIN activity topic. The operator holds the submit key, so
   * only this backend can append messages; the admin key allows memo updates.
   */
  async createTopic({ memo = "LANDCHAIN property activity log" } = {}) {
    const client = this.client();
    const operatorKey = client.operatorPublicKey;

    const transaction = new TopicCreateTransaction()
      .setTopicMemo(memo)
      .setAdminKey(operatorKey)
      .setSubmitKey(operatorKey)
      .setMaxTransactionFee(new Hbar(5));

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);
    if (!receipt.topicId) {
      throw new TransactionError("Topic creation did not return a topic ID.", {
        details: { transactionId: response.transactionId.toString() },
      });
    }

    const topicId = receipt.topicId.toString();
    return {
      topicId,
      memo,
      transactionId: response.transactionId.toString(),
      status: receipt.status.toString(),
      explorerUrl: explorer.topic(topicId),
    };
  }

  /**
   * Append one JSON message to the topic.
   * Returns the real transaction ID and the consensus sequence number - never a
   * generated placeholder.
   */
  async submitMessage(payload, { topicId = this.topicId } = {}) {
    const id = assertTopicId(topicId);
    const message = hcsPayloadSize(payload, MAX_MESSAGE_BYTES);
    const client = this.client();

    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(id)
      .setMessage(JSON.stringify(message))
      .setMaxTransactionFee(new Hbar(config.hcsMaxFeeTinybar, HbarUnit.Tinybar));

    let response;
    try {
      response = await transaction.execute(client);
      const receipt = await response.getReceipt(client);
      return {
        topicId: id,
        sequenceNumber: receipt.topicSequenceNumber ? Number(receipt.topicSequenceNumber) : null,
        transactionId: response.transactionId.toString(),
        status: receipt.status.toString(),
        explorerUrl: explorer.transaction(response.transactionId.toString()),
        topicUrl: explorer.topic(id),
      };
    } catch (error) {
      throw new TransactionError(`Failed to submit the HCS message: ${error.message}`, {
        cause: error,
      });
    }
  }

  /** Build the canonical event envelope and append it to the topic. */
  async recordEvent({
    type,
    propertyId,
    data = {},
    actor,
    timestamp = new Date().toISOString(),
  }) {
    const envelope = {
      v: MESSAGE_VERSION,
      type: eventType(type),
      propertyId: parsePropertyId(propertyId),
      actor: actor ? requiredString(actor, "actor", { max: 64 }) : getOperatorAccountId().toString(),
      timestamp,
      data,
    };

    const submission = await this.submitMessage(envelope);
    return { ...submission, event: envelope };
  }

  /** Read the append-only history back from the mirror node. */
  async getEventHistory({ limit = 25, order = "asc", sequenceNumber } = {}, { mirror } = {}) {
    const id = assertTopicId(this.topicId);
    if (!mirror) {
      throw new ValidationError("A MirrorNodeClient instance is required to read topic messages.");
    }
    return mirror.getTopicMessages(id, { limit, order, sequenceNumber });
  }
}

module.exports = { ConsensusService, MESSAGE_VERSION, MAX_MESSAGE_BYTES };
