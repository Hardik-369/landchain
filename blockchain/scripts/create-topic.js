/**
 * Create the Hedera Consensus Service topic used as the LANDCHAIN activity log.
 *
 *   npm run topic:create
 *
 * Requires HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in blockchain/.env.
 * Prints the topic ID to paste into the environment.
 */
const { ConsensusService } = require("../src/hedera/consensus");
const { config, hasOperatorCredentials } = require("../src/config");
const { closeClient } = require("../src/hedera/client");

async function main() {
  if (!hasOperatorCredentials()) {
    throw new Error(
      "Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in blockchain/.env first.",
    );
  }

  console.log(`Creating HCS topic on Hedera Testnet as ${config.operatorId}...`);
  const service = new ConsensusService();
  const topic = await service.createTopic();

  console.log("\nTopic created.\n");
  console.log(`HEDERA_PROPERTY_TOPIC_ID=${topic.topicId}`);
  console.log(`Status          : ${topic.status}`);
  console.log(`Transaction     : ${topic.transactionId}`);
  console.log(`Explorer        : ${topic.explorerUrl}`);
  console.log(
    "\nThe operator holds the submit key, so only this backend can append events.",
  );
}

main()
  .catch((error) => {
    console.error(`\nTopic creation failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => closeClient());
