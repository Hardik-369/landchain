/**
 * Deploy the LANDCHAIN contracts to Hedera Testnet (Smart Contract Service).
 *
 *   npm run deploy:testnet      # Hedera Testnet
 *   npm run deploy:local        # in-memory Hardhat chain (script smoke test)
 *
 * Required for Testnet:
 *   HEDERA_OPERATOR_EVM_KEY  - 0x-prefixed 32-byte key for the JSON-RPC relay
 *
 * The script prints the addresses to paste into blockchain/.env and writes
 * deployments/hedera-testnet.json. It never writes or prints key material.
 */
const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");
const { explorer } = require("../src/utils/explorer");

const DEPLOY_GAS_LIMIT = BigInt(process.env.HEDERA_DEPLOY_GAS_LIMIT || 4_000_000);
const CALL_GAS_LIMIT = 1_500_000n;

async function deployContract(name, args = []) {
  process.stdout.write(`\nDeploying ${name}...`);
  const factory = await hre.ethers.getContractFactory(name);
  const contract = await factory.deploy(...args, { gasLimit: DEPLOY_GAS_LIMIT });
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(` ${address}`);
  return contract;
}

async function main() {
  const networkName = hre.network.name;
  const operators = await hre.ethers.getSigners();
  if (!operators.length) {
    throw new Error(
      "No signer available. Set HEDERA_OPERATOR_EVM_KEY in blockchain/.env for Hedera Testnet.",
    );
  }
  const deployer = operators[0];
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);

  console.log("LANDCHAIN contract deployment");
  console.log("-----------------------------");
  console.log(`Network  : ${networkName} (chain ${chainId})`);
  console.log(`Deployer : ${deployer.address}`);

  if (networkName === "hederaTestnet" && chainId !== 296) {
    throw new Error(`Expected Hedera Testnet chain 296, connected to ${chainId}.`);
  }

  const registry = await deployContract("PropertyRegistry");
  const pool = await deployContract("InvestmentPool");
  const allocation = await deployContract("TokenAllocation");
  const allocationAddress = await allocation.getAddress();
  const resale = await deployContract("ResaleContract", [allocationAddress]);

  const registryAddress = await registry.getAddress();
  const poolAddress = await pool.getAddress();
  const resaleAddress = await resale.getAddress();

  console.log("\nWiring roles and the resale escrow...");

  const registryVerifier = await registry.setVerifier(deployer.address, true, {
    gasLimit: CALL_GAS_LIMIT,
  });
  await registryVerifier.wait();

  const poolOperator = await pool.setOperator(deployer.address, true, { gasLimit: CALL_GAS_LIMIT });
  await poolOperator.wait();

  const allocationOperator = await allocation.setOperator(deployer.address, true, {
    gasLimit: CALL_GAS_LIMIT,
  });
  await allocationOperator.wait();

  const resaleOperator = await resale.setOperator(deployer.address, true, {
    gasLimit: CALL_GAS_LIMIT,
  });
  await resaleOperator.wait();

  const escrow = await allocation.setAuthorizedContract(resaleAddress, true, {
    gasLimit: CALL_GAS_LIMIT,
  });
  await escrow.wait();

  console.log("Roles wired. Only the operator can record, allocate or settle.");

  const deployment = {
    network: networkName,
    chainId,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      propertyRegistry: registryAddress,
      investmentPool: poolAddress,
      tokenAllocation: allocationAddress,
      resale: resaleAddress,
    },
    explorer: {
      propertyRegistry: explorer.contract(registryAddress),
      investmentPool: explorer.contract(poolAddress),
      tokenAllocation: explorer.contract(allocationAddress),
      resale: explorer.contract(resaleAddress),
    },
  };

  console.log("\nDeployment complete.\n");
  console.log("Add these to blockchain/.env:\n");
  console.log(`PROPERTY_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`INVESTMENT_POOL_ADDRESS=${poolAddress}`);
  console.log(`TOKEN_ALLOCATION_ADDRESS=${allocationAddress}`);
  console.log(`RESALE_CONTRACT_ADDRESS=${resaleAddress}`);

  if (networkName === "hederaTestnet") {
    const dir = path.join(__dirname, "..", "deployments");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "hedera-testnet.json");
    fs.writeFileSync(file, `${JSON.stringify(deployment, null, 2)}\n`);
    console.log(`\nSaved ${path.relative(process.cwd(), file)}`);
    console.log(`Explorer: ${deployment.explorer.propertyRegistry}`);
  } else {
    console.log("\n(Local network: addresses are ephemeral and were not saved.)");
  }
}

main().catch((error) => {
  console.error(`\nDeployment failed: ${error.message}`);
  process.exitCode = 1;
});
