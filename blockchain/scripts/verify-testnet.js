/**
 * Verify the LANDCHAIN blockchain integration against live Hedera Testnet state.
 *
 *   npm run verify:testnet
 *   npm run verify:testnet -- --token 0.0.1234567
 *
 * Read-only: no keys are needed for the mirror checks, no transactions are
 * submitted. Exits non-zero when a configured component is unreachable.
 */
const { config, hasOperatorCredentials } = require("../src/config");
const { MirrorNodeClient } = require("../src/hedera/mirror");
const { ContractsClient } = require("../src/hedera/contracts");
const { explorer } = require("../src/utils/explorer");

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

function info(name, detail) {
  console.log(`INFO  ${name}${detail ? `  - ${detail}` : ""}`);
}

async function main() {
  const mirror = new MirrorNodeClient();
  const tokenArgIndex = process.argv.indexOf("--token");
  const tokenId = tokenArgIndex > -1 ? process.argv[tokenArgIndex + 1] : null;

  console.log(`\nLANDCHAIN - Hedera Testnet verification`);
  console.log(`Network : ${config.network} (chain ${config.chainId})`);
  console.log(`Mirror  : ${config.mirrorNodeUrl}`);
  console.log(`RPC     : ${config.jsonRpcUrl}\n`);

  if (config.network !== "testnet" || config.chainId !== 296) {
    record("network is Hedera Testnet", false, `${config.network}/${config.chainId}`);
  } else {
    record("network is Hedera Testnet", true, "chain 296");
  }

  // 1. Mirror node ---------------------------------------------------------
  try {
    const rate = await mirror.getExchangeRate();
    record("mirror node reachable", true, `1 HBAR ~ $${rate.hbarToUsd.toFixed(4)}`);
  } catch (error) {
    record("mirror node reachable", false, error.message);
  }

  // 2. Operator account ----------------------------------------------------
  if (!hasOperatorCredentials()) {
    record("operator credentials configured", false, "HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY missing");
  } else {
    try {
      const account = await mirror.getAccount(config.operatorId);
      record(
        "operator account on testnet",
        !account.deleted,
        `${account.accountId} · ${account.balanceHbar} HBAR`,
      );
      info("operator explorer", account.explorerUrl);
      if (account.balanceHbar < 1) {
        record("operator balance sufficient", false, `${account.balanceHbar} HBAR (top up at portal.hedera.com)`);
      }
    } catch (error) {
      record("operator account on testnet", false, error.message);
    }
  }

  // 3. Contracts -----------------------------------------------------------
  if (hasOperatorCredentials()) {
    const client = new ContractsClient();
    for (const [name, address] of Object.entries(config.contracts)) {
      if (!address) {
        record(`${name} configured`, false, "address missing - run npm run deploy:testnet");
        continue;
      }
      try {
        const code = await client.provider().getCode(address);
        const deployed = code && code !== "0x";
        record(`${name} deployed`, deployed, `${address} · ${deployed ? `${(code.length - 2) / 2} bytes` : "no bytecode"}`);
        if (deployed) info(`${name} explorer`, explorer.contract(address));
      } catch (error) {
        record(`${name} deployed`, false, error.message);
      }
    }
  } else {
    info("contract checks skipped", "no operator credentials");
  }

  // 4. HCS topic -----------------------------------------------------------
  if (!config.topicId) {
    record("HCS topic configured", false, "HEDERA_PROPERTY_TOPIC_ID missing - run npm run topic:create");
  } else {
    try {
      const topic = await mirror.getTopic(config.topicId);
      record("HCS topic exists", true, `${topic.topicId} · submit key ${topic.submitKey ? "set" : "open"}`);
      info("topic explorer", topic.explorerUrl);

      const messages = await mirror.getTopicMessages(config.topicId, { limit: 10, order: "desc" });
      info("recent HCS messages", String(messages.length));
      for (const message of messages.slice(0, 3)) {
        info(
          `  #${message.sequenceNumber}`,
          `${message.payload?.type ?? "message"} · ${message.payload?.propertyId ?? "-"} · ${message.consensusTimestamp}`,
        );
      }
    } catch (error) {
      record("HCS topic exists", false, error.message);
    }
  }

  // 5. Token ---------------------------------------------------------------
  if (tokenId) {
    try {
      const token = await mirror.getToken(tokenId);
      record("token exists", true, `${token.tokenId} ${token.symbol} · supply ${token.totalSupply}`);
      info("token explorer", token.explorerUrl);
    } catch (error) {
      record("token exists", false, error.message);
    }
  }

  const failures = results.filter((entry) => !entry.ok);
  console.log(`\n${results.length - failures.length}/${results.length} checks passed.`);
  if (failures.length) {
    console.log("Failed checks:");
    for (const failure of failures) console.log(`  - ${failure.name}: ${failure.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nVerification failed: ${error.message}`);
  process.exitCode = 1;
});
