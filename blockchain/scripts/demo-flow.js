/**
 * End-to-end LANDCHAIN flow on Hedera Testnet.
 *
 *   npm run demo
 *   npm run demo -- --property LAND-2026-777 --symbol LAND777
 *
 * Requires, in blockchain/.env:
 *   HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY  - server signing account
 *   HEDERA_OPERATOR_EVM_KEY                  - same account, EVM key for contracts
 *   HEDERA_PROPERTY_TOPIC_ID                 - run `npm run topic:create` once
 *   PROPERTY_REGISTRY_ADDRESS, INVESTMENT_POOL_ADDRESS,
 *   TOKEN_ALLOCATION_ADDRESS, RESALE_CONTRACT_ADDRESS - run `npm run deploy:testnet`
 *
 * Optional:
 *   DEMO_INVESTOR_ACCOUNT_ID - an investor account already associated with the
 *                              new token, used for the allocation step.
 *
 * Every transaction ID printed here comes from a Hedera receipt.
 */
const { getBlockchainService } = require("../src/services/blockchain.service");
const { config, hasOperatorCredentials } = require("../src/config");
const { sha256Hex } = require("../src/utils/hash");
const { closeClient } = require("../src/hedera/client");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
}

function step(title) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  const propertyId = arg("property", "LAND-2026-900");
  const symbol = arg("symbol", "LAND900");

  if (!hasOperatorCredentials()) {
    console.log(
      "Demo needs a Hedera Testnet account.\n" +
        "  1. Create one at https://portal.hedera.com (choose Testnet).\n" +
        "  2. Copy HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY into blockchain/.env.\n" +
        "  3. Run npm run deploy:testnet and npm run topic:create.\n" +
        "Nothing was submitted.",
    );
    return;
  }

  const missing = Object.entries(config.contracts)
    .filter(([, address]) => !address)
    .map(([name]) => name);
  if (missing.length || !config.topicId) {
    console.log(
      `Demo is not configured yet. Missing: ${[...missing, ...(config.topicId ? [] : ["topicId"])].join(", ")}\n` +
        "Run npm run deploy:testnet and npm run topic:create first.",
    );
    return;
  }

  const service = getBlockchainService();

  step("Network and wallet");
  console.log(await service.getNetworkInfo());
  const wallet = await service.connectWallet({ accountId: config.operatorId });
  console.log(
    `${wallet.accountId} connected to ${wallet.network} · ${wallet.balanceHbar} HBAR`,
  );
  console.log(wallet.explorerUrl);

  step("Register the property hash");
  const propertyPayload = {
    id: propertyId,
    title: "LANDCHAIN demo property",
    city: "Pune",
    totalUnits: 1000,
    unitPrice: 50000,
    notarised: new Date().toISOString(),
  };
  const propertyHash = sha256Hex(propertyPayload);
  let registration;
  try {
    registration = await service.registerProperty({
      propertyId,
      propertyHash,
      actor: wallet.accountId,
      metadata: { title: propertyPayload.title },
    });
    console.log(`property hash : ${registration.propertyHash}`);
    console.log(`tx            : ${registration.transaction.transactionHash}`);
    console.log(`explorer      : ${registration.explorerUrl}`);
    console.log(`HCS audit     : ${JSON.stringify(registration.audit)}`);
  } catch (error) {
    if (/already/i.test(error.message)) {
      console.log(`Property ${propertyId} is already registered - continuing.`);
      registration = await service.getPropertyRecord({ propertyId, propertyHash });
      console.log(`on-chain hash : ${registration.propertyHash}`);
      console.log(`verified      : ${registration.verified}`);
    } else {
      throw error;
    }
  }

  step("Anchor a document hash");
  const document = `LANDCHAIN demo title deed for ${propertyId}`;
  const documentHash = sha256Hex(document);
  const anchored = await service.storeDocumentHash({
    propertyId,
    documentHash,
    documentType: "title_deed",
    actor: wallet.accountId,
  });
  console.log(`document hash : ${anchored.documentHash}`);
  console.log(`tx            : ${anchored.transaction.transactionHash}`);
  console.log(`explorer      : ${anchored.explorerUrl}`);

  step("Record an activity event");
  const event = await service.recordPropertyEvent({
    propertyId,
    eventType: "document_verified",
    actor: wallet.accountId,
    data: { documentHash: anchored.documentHash, verifier: wallet.accountId },
  });
  console.log(`sequence      : ${event.sequenceNumber}`);
  console.log(`tx            : ${event.transactionId}`);
  console.log(`explorer      : ${event.explorerUrl}`);

  step("Create the property token (HTS)");
  let token;
  try {
    token = await service.createPropertyToken({
      propertyId,
      name: `LANDCHAIN ${propertyId}`,
      symbol,
      totalUnits: propertyPayload.totalUnits,
      actor: wallet.accountId,
    });
    console.log(`token         : ${token.tokenId} (${token.symbol})`);
    console.log(`supply        : ${token.totalSupply}`);
    console.log(`tx            : ${token.transactionId}`);
    console.log(`explorer      : ${token.explorerUrl}`);
  } catch (error) {
    console.log(`Token was not created: ${error.message}`);
    console.log("If the token already exists for this property, reuse it or pick a new --symbol.");
  }

  step("Configure the Solidity layer");
  const configured = await service.configurePropertyOnChain({
    propertyId,
    totalUnits: propertyPayload.totalUnits,
    targetAmount: 50_000_000,
    minInvestment: 50_000,
    unitPrice: 50_000,
    actor: wallet.accountId,
  });
  console.log(`supply tx     : ${configured.supply.transactionHash ?? "skipped"}`);
  console.log(`pool tx       : ${configured.pool.transactionHash ?? "skipped"}`);

  const pool = await service.getInvestmentPool(propertyId);
  console.log(`funding       : ${pool.fundingProgressBps / 100}% of ${pool.targetAmount}`);

  step("Allocate units");
  const investor = process.env.DEMO_INVESTOR_ACCOUNT_ID;
  if (!investor || !token) {
    console.log(
      "Set DEMO_INVESTOR_ACCOUNT_ID (an account already associated with the token) to run the allocation step.",
    );
  } else {
    const allocated = await service.allocateUnits({
      propertyId,
      tokenId: token.tokenId,
      investorAccountId: investor,
      units: 10,
      actor: wallet.accountId,
    });
    console.log(`investor      : ${allocated.investorAccountId}`);
    console.log(`units         : ${allocated.units}`);
    console.log(`HTS tx        : ${allocated.htsTransaction.transactionId}`);
    console.log(`ledger tx     : ${allocated.allocationTransaction.transactionHash}`);
  }

  step("Verify on-chain state");
  const record = await service.getPropertyRecord({ propertyId, propertyHash });
  console.log(`registered at : ${record.registeredAt}`);
  console.log(`hash verified : ${record.verified}`);
  const documentCheck = await service.verifyDocumentHash({ propertyId, documentHash });
  console.log(`document ok   : ${documentCheck.verified}`);
  console.log(`events        : ${(await service.getPropertyEvents({ propertyId })).length}`);

  if (token) {
    const history = await service.getTransactionHistory({ accountId: wallet.accountId, limit: 5 });
    console.log(`\nRecent transactions for ${history.accountId}:`);
    for (const entry of history.transactions) {
      console.log(`  ${entry.status}  ${entry.transactionId}  ${entry.explorerUrl}`);
    }
  }

  console.log("\nDemo complete.");
}

main()
  .catch((error) => {
    console.error(`\nDemo failed: ${error.message}`);
    if (error.details) console.error(JSON.stringify(error.details, null, 2));
    process.exitCode = 1;
  })
  .finally(() => closeClient());
