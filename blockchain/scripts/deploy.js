/**
 * Deploy and wire the LANDCHAIN contracts on Hedera Testnet.
 *
 *   npm run deploy:testnet            # deploy (or reuse a saved deployment) + wire roles
 *   npm run deploy:testnet -- --fresh # always deploy new contracts
 *   npm run deploy:testnet -- --wire-only
 *
 * Uses ethers directly against the Hedera JSON-RPC relay. The relay occasionally
 * returns 502/504 responses during receipt polling, so every RPC call is retried
 * and role wiring is idempotent: it checks on-chain state before every write and
 * after every retry, which makes re-running the script safe.
 *
 * Never writes or prints key material.
 */
const fs = require("node:fs");
const path = require("node:path");
const { JsonRpcProvider, Wallet, ContractFactory, Contract } = require("ethers");
const { config, assertTestnet, hasOperatorCredentials } = require("../src/config");
const { readArtifact } = require("../src/hedera/contracts");
const { explorer } = require("../src/utils/explorer");

const DEPLOY_GAS_LIMIT = BigInt(process.env.HEDERA_DEPLOY_GAS_LIMIT || 4_000_000);
const CALL_GAS_LIMIT = 1_500_000n;
const DEPLOYMENTS_DIR = path.join(__dirname, "..", "deployments");
const DEPLOYMENT_FILE = path.join(DEPLOYMENTS_DIR, "hedera-testnet.json");

const CONTRACTS = [
  { key: "propertyRegistry", name: "PropertyRegistry", args: [] },
  { key: "investmentPool", name: "InvestmentPool", args: [] },
  { key: "tokenAllocation", name: "TokenAllocation", args: [] },
  { key: "resale", name: "ResaleContract", args: ["tokenAllocation"] },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransient(error) {
  const text = `${error?.shortMessage ?? ""} ${error?.message ?? ""}`;
  return /502|503|504|bad data|bad_data|timeout|timed out|econnreset|socket hang up|server_error|invalid json|network error/i.test(
    text,
  );
}

/** Run an RPC action, retrying transient relay failures with backoff. */
async function rpc(label, action, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === attempts) break;
      const wait = 1_500 * attempt;
      console.log(
        `    relay hiccup on ${label} (${error.shortMessage ?? error.message}); retry ${attempt}/${attempts - 1}`,
      );
      await sleep(wait);
    }
  }
  throw lastError;
}

function loadDeployment() {
  if (!fs.existsSync(DEPLOYMENT_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf8"));
  } catch {
    return null;
  }
}

function saveDeployment(deployment) {
  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  fs.writeFileSync(DEPLOYMENT_FILE, `${JSON.stringify(deployment, null, 2)}\n`);
}

async function deployContract({ key, name, args }, wallet, addresses) {
  const artifact = readArtifact(name);
  const resolvedArgs = args.map((arg) => addresses[arg]);
  console.log(`\nDeploying ${name}...`);
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await rpc(`deploy ${name}`, () =>
    factory.deploy(...resolvedArgs, { gasLimit: DEPLOY_GAS_LIMIT }),
  );
  await rpc(`wait ${name}`, () => contract.waitForDeployment());
  const address = await contract.getAddress();
  if (!address) throw new Error(`${name} deployment returned no address.`);
  console.log(`  ${name}: ${address}`);
  return address;
}

/**
 * Ensure a role/authorisation is set. Re-checks state after transient failures,
 * so a write that landed despite a 502 is never duplicated.
 */
async function ensure({ label, contract, method, args, isSet }) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    if (await rpc(`${label} check`, isSet)) {
      console.log(`  ${label}: already set`);
      return;
    }
    try {
      const tx = await contract[method](...args, { gasLimit: CALL_GAS_LIMIT });
      const receipt = await rpc(`${label} receipt`, () => tx.wait());
      if (!receipt || receipt.status !== 1) {
        throw new Error(`${label} transaction failed (status ${receipt?.status}).`);
      }
      console.log(`  ${label}: set (${receipt.hash})`);
      return;
    } catch (error) {
      if (!isTransient(error) || attempt === 6) throw error;
      console.log(
        `    relay hiccup on ${label} (${error.shortMessage ?? error.message}); re-checking state`,
      );
      await sleep(1_500 * attempt);
    }
  }
}

async function main() {
  assertTestnet();
  if (!hasOperatorCredentials()) {
    throw new Error(
      "Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in blockchain/.env first.",
    );
  }
  if (!config.operatorEvmKey) {
    throw new Error(
      "Set HEDERA_OPERATOR_EVM_KEY (0x-prefixed hex key of the same account) in blockchain/.env.",
    );
  }

  const fresh = process.argv.includes("--fresh");
  const wireOnly = process.argv.includes("--wire-only");

  const provider = new JsonRpcProvider(config.jsonRpcUrl, config.chainId, {
    staticNetwork: true,
  });
  const wallet = new Wallet(config.operatorEvmKey, provider);
  const chainId = Number((await rpc("chain id", () => provider.getNetwork())).chainId);
  if (chainId !== 296) throw new Error(`Expected Hedera Testnet chain 296, got ${chainId}.`);

  console.log("LANDCHAIN contract deployment");
  console.log("-----------------------------");
  console.log(`Network  : Hedera Testnet (chain ${chainId})`);
  console.log(`Deployer : ${wallet.address}`);
  console.log(
    `Balance  : ${(await rpc("balance", () => provider.getBalance(wallet.address))) / 10n ** 18n} HBAR`,
  );

  let deployment = loadDeployment();
  const reuse = !fresh && deployment?.contracts?.propertyRegistry;

  if (!wireOnly && !reuse) {
    const addresses = { tokenAllocation: null };
    for (const entry of CONTRACTS) {
      addresses[entry.key] = await deployContract(entry, wallet, addresses);
    }
    deployment = {
      network: "hedera-testnet",
      chainId,
      deployer: wallet.address,
      recordedAt: new Date().toISOString(),
      contracts: {
        propertyRegistry: addresses.propertyRegistry,
        investmentPool: addresses.investmentPool,
        tokenAllocation: addresses.tokenAllocation,
        resale: addresses.resale,
      },
      explorer: {
        propertyRegistry: explorer.contract(addresses.propertyRegistry),
        investmentPool: explorer.contract(addresses.investmentPool),
        tokenAllocation: explorer.contract(addresses.tokenAllocation),
        resale: explorer.contract(addresses.resale),
      },
    };
    saveDeployment(deployment);
    console.log(`\nSaved ${path.relative(process.cwd(), DEPLOYMENT_FILE)}`);
  } else {
    console.log(`\nReusing deployment from ${path.relative(process.cwd(), DEPLOYMENT_FILE)}`);
  }

  const addresses = deployment.contracts;
  for (const [name, address] of Object.entries(addresses)) {
    if (!address) throw new Error(`Deployment file is missing the ${name} address.`);
    const code = await rpc(`${name} code`, () => provider.getCode(address));
    if (!code || code === "0x") {
      throw new Error(`${name} has no bytecode at ${address}. Redeploy with --fresh.`);
    }
  }

  const contracts = {};
  for (const entry of CONTRACTS) {
    contracts[entry.key] = new Contract(
      addresses[entry.key],
      readArtifact(entry.name).abi,
      wallet,
    );
  }

  console.log("\nWiring roles and the resale escrow...");
  await ensure({
    label: "registry verifier",
    contract: contracts.propertyRegistry,
    method: "setVerifier",
    args: [wallet.address, true],
    isSet: () => contracts.propertyRegistry.isVerifier(wallet.address),
  });
  await ensure({
    label: "pool operator",
    contract: contracts.investmentPool,
    method: "setOperator",
    args: [wallet.address, true],
    isSet: () => contracts.investmentPool.isOperator(wallet.address),
  });
  await ensure({
    label: "allocation operator",
    contract: contracts.tokenAllocation,
    method: "setOperator",
    args: [wallet.address, true],
    isSet: () => contracts.tokenAllocation.isOperator(wallet.address),
  });
  await ensure({
    label: "resale operator",
    contract: contracts.resale,
    method: "setOperator",
    args: [wallet.address, true],
    isSet: () => contracts.resale.isOperator(wallet.address),
  });
  await ensure({
    label: "resale escrow authorisation",
    contract: contracts.tokenAllocation,
    method: "setAuthorizedContract",
    args: [addresses.resale, true],
    isSet: () => contracts.tokenAllocation.isAuthorizedContract(addresses.resale),
  });

  deployment.allWired = {
    verifier: await contracts.propertyRegistry.isVerifier(wallet.address),
    poolOperator: await contracts.investmentPool.isOperator(wallet.address),
    allocationOperator: await contracts.tokenAllocation.isOperator(wallet.address),
    resaleOperator: await contracts.resale.isOperator(wallet.address),
    escrowAuthorised: await contracts.tokenAllocation.isAuthorizedContract(addresses.resale),
  };
  saveDeployment(deployment);

  console.log("\nDeployment complete.\n");
  console.log("Add these to blockchain/.env:\n");
  for (const [key, envName] of Object.entries({
    propertyRegistry: "PROPERTY_REGISTRY_ADDRESS",
    investmentPool: "INVESTMENT_POOL_ADDRESS",
    tokenAllocation: "TOKEN_ALLOCATION_ADDRESS",
    resale: "RESALE_CONTRACT_ADDRESS",
  })) {
    console.log(`${envName}=${addresses[key]}`);
  }
  console.log(`\nExplorer: ${deployment.explorer.propertyRegistry}`);
  console.log(`Wiring  : ${JSON.stringify(deployment.allWired)}`);

  provider.destroy();
}

main().catch((error) => {
  console.error(`\nDeployment failed: ${error.message}`);
  process.exitCode = 1;
});
