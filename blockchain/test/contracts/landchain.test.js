const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

const PROPERTY = "LAND-2026-001";
const HASH_A = `0x${"a".repeat(64)}`;
const HASH_B = `0x${"b".repeat(64)}`;
const DOC_HASH = `0x${"c".repeat(64)}`;
const ZERO = "0x0000000000000000000000000000000000000000";

describe("LANDCHAIN Solidity contracts", function () {
  let admin;
  let verifier;
  let operator;
  let investorA;
  let investorB;
  let outsider;
  let registry;
  let pool;
  let allocation;
  let resale;

  async function deploy() {
    [admin, verifier, operator, investorA, investorB, outsider] = await ethers.getSigners();

    registry = await (await ethers.getContractFactory("PropertyRegistry")).deploy();
    await registry.waitForDeployment();

    pool = await (await ethers.getContractFactory("InvestmentPool")).deploy();
    await pool.waitForDeployment();

    allocation = await (await ethers.getContractFactory("TokenAllocation")).deploy();
    await allocation.waitForDeployment();

    resale = await (
      await ethers.getContractFactory("ResaleContract")
    ).deploy(await allocation.getAddress());
    await resale.waitForDeployment();

    await registry.setVerifier(verifier.address, true);
    await pool.setOperator(operator.address, true);
    await allocation.setOperator(operator.address, true);
    await resale.setOperator(operator.address, true);
    await allocation.setAuthorizedContract(await resale.getAddress(), true);
  }

  async function increaseTime(seconds) {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
  }

  beforeEach(deploy);

  describe("access control", function () {
    it("makes the deployer the admin", async function () {
      assert.equal(await registry.admin(), admin.address);
      assert.equal(await pool.admin(), admin.address);
      assert.equal(await allocation.admin(), admin.address);
      assert.equal(await resale.admin(), admin.address);
    });

    it("only lets the admin grant roles", async function () {
      await assert.rejects(registry.connect(outsider).setVerifier(outsider.address, true));
      await assert.rejects(pool.connect(outsider).setOperator(outsider.address, true));
    });
  });

  describe("PropertyRegistry", function () {
    it("registers a property with its hash and timestamp", async function () {
      await registry.connect(verifier).registerProperty(PROPERTY, HASH_A);

      assert.equal(await registry.hasProperty(PROPERTY), true);
      const [hash, registeredAt, , documents, version] = await registry.getProperty(PROPERTY);
      assert.equal(hash, HASH_A);
      assert.ok(Number(registeredAt) > 0);
      assert.equal(Number(documents), 0);
      assert.equal(Number(version), 1);
      assert.equal(await registry.verifyPropertyHash(PROPERTY, HASH_A), true);
      assert.equal(await registry.verifyPropertyHash(PROPERTY, HASH_B), false);
      assert.equal(Number(await registry.propertyCount()), 1);
    });

    it("rejects registration from an unauthorised account", async function () {
      await assert.rejects(registry.connect(outsider).registerProperty(PROPERTY, HASH_A));
    });

    it("rejects a duplicate property ID", async function () {
      await registry.connect(verifier).registerProperty(PROPERTY, HASH_A);
      await assert.rejects(registry.connect(verifier).registerProperty(PROPERTY, HASH_A));
    });

    it("rejects an empty property ID or zero hash", async function () {
      await assert.rejects(registry.connect(verifier).registerProperty("", HASH_A));
      await assert.rejects(
        registry.connect(verifier).registerProperty(PROPERTY, `0x${"0".repeat(64)}`),
      );
    });

    it("anchors document hashes and keeps them all", async function () {
      await registry.connect(verifier).registerProperty(PROPERTY, HASH_A);
      await registry.connect(verifier).storeDocumentHash(PROPERTY, DOC_HASH, "sale_deed");

      assert.equal(Number(await registry.getDocumentCount(PROPERTY)), 1);
      const [documentHash, documentType, anchoredAt, anchoredBy] = await registry.getDocument(
        PROPERTY,
        0,
      );
      assert.equal(documentHash, DOC_HASH);
      assert.equal(documentType, "sale_deed");
      assert.ok(Number(anchoredAt) > 0);
      assert.equal(anchoredBy, verifier.address);

      const hashes = await registry.getDocumentHashes(PROPERTY);
      assert.deepEqual([...hashes], [DOC_HASH]);
    });

    it("supersedes hashes while keeping the full history", async function () {
      await registry.connect(verifier).registerProperty(PROPERTY, HASH_A);
      await registry.connect(verifier).updatePropertyHash(PROPERTY, HASH_B);

      const [latest, , , , version] = await registry.getProperty(PROPERTY);
      assert.equal(latest, HASH_B);
      assert.equal(Number(version), 2);
      assert.equal(await registry.verifyPropertyHash(PROPERTY, HASH_A), false);
      assert.deepEqual([...(await registry.getPropertyHashHistory(PROPERTY))], [HASH_A, HASH_B]);
    });

    it("cannot anchor a document for an unregistered property", async function () {
      await assert.rejects(
        registry.connect(verifier).storeDocumentHash("LAND-UNKNOWN", DOC_HASH, "deed"),
      );
    });
  });

  describe("InvestmentPool", function () {
    const target = 250_000n;
    const minInvestment = 50_000n;
    const unitPrice = 1_000n;
    const totalUnits = 250;

    beforeEach(async function () {
      await pool.connect(operator).openPool(PROPERTY, target, minInvestment, unitPrice, totalUnits);
    });

    it("opens a pool with the published terms", async function () {
      const [itTarget, itMin, itPrice, raised, units, sold, open] = await pool.getPool(PROPERTY);
      assert.equal(itTarget, target);
      assert.equal(itMin, minInvestment);
      assert.equal(itPrice, unitPrice);
      assert.equal(raised, 0n);
      assert.equal(Number(units), totalUnits);
      assert.equal(Number(sold), 0);
      assert.equal(open, true);
    });

    it("records a valid investment and tracks funding", async function () {
      await pool
        .connect(operator)
        .recordInvestment(PROPERTY, investorA.address, 50, 50_000n, HASH_A);

      const [, , , raised, , sold] = await pool.getPool(PROPERTY);
      assert.equal(raised, 50_000n);
      assert.equal(Number(sold), 50);
      assert.equal(Number(await pool.fundingProgressBps(PROPERTY)), 2_000);
      assert.equal(await pool.isFunded(PROPERTY), false);
      assert.equal(Number(await pool.unitsRemaining(PROPERTY)), 200);

      const [amount, units] = await pool.contributionOf(PROPERTY, investorA.address);
      assert.equal(amount, 50_000n);
      assert.equal(Number(units), 50);
    });

    it("rejects an incorrect amount", async function () {
      await assert.rejects(
        pool.connect(operator).recordInvestment(PROPERTY, investorA.address, 50, 49_999n, HASH_A),
      );
    });

    it("rejects an amount below the minimum investment", async function () {
      // 20 units * 1000 = 20_000, below the 50_000 minimum.
      await assert.rejects(
        pool.connect(operator).recordInvestment(PROPERTY, investorA.address, 20, 20_000n, HASH_A),
      );
    });

    it("rejects more units than remain", async function () {
      await assert.rejects(
        pool.connect(operator).recordInvestment(PROPERTY, investorA.address, 251, 251_000n, HASH_A),
      );
    });

    it("rejects an investment that exceeds the funding target", async function () {
      // 250 units is the whole pool at 1000/unit = 250_000; a 300-unit request
      // is rejected before the target check by the unit cap.
      await assert.rejects(
        pool.connect(operator).recordInvestment(PROPERTY, investorA.address, 250, 260_000n, HASH_A),
      );
    });

    it("only lets the operator record investments", async function () {
      await assert.rejects(
        pool.connect(outsider).recordInvestment(PROPERTY, investorA.address, 50, 50_000n, HASH_A),
      );
    });

    it("marks the pool funded after reaching the target", async function () {
      await pool
        .connect(operator)
        .recordInvestment(PROPERTY, investorA.address, 250, 250_000n, HASH_A);
      assert.equal(await pool.isFunded(PROPERTY), true);
      assert.equal(Number(await pool.fundingProgressBps(PROPERTY)), 10_000);
    });

    it("stops accepting investments once closed", async function () {
      await pool.closePool(PROPERTY);
      await assert.rejects(
        pool.connect(operator).recordInvestment(PROPERTY, investorA.address, 50, 50_000n, HASH_A),
      );
    });
  });

  describe("TokenAllocation", function () {
    const totalUnits = 1_000;

    beforeEach(async function () {
      await allocation.connect(operator).setPropertySupply(PROPERTY, totalUnits);
    });

    it("sets a fixed supply that cannot be changed", async function () {
      const [total, allocated, remaining] = await allocation.getSupply(PROPERTY);
      assert.equal(Number(total), totalUnits);
      assert.equal(Number(allocated), 0);
      assert.equal(Number(remaining), totalUnits);
      await assert.rejects(allocation.connect(operator).setPropertySupply(PROPERTY, 2_000));
    });

    it("allocates units and calculates ownership", async function () {
      await allocation.connect(operator).allocate(PROPERTY, investorA.address, 250);
      assert.equal(Number(await allocation.balanceOf(PROPERTY, investorA.address)), 250);
      assert.equal(Number(await allocation.ownershipBps(PROPERTY, investorA.address)), 2_500);

      const [, allocated, remaining] = await allocation.getSupply(PROPERTY);
      assert.equal(Number(allocated), 250);
      assert.equal(Number(remaining), 750);
    });

    it("prevents over-allocation", async function () {
      await assert.rejects(
        allocation.connect(operator).allocate(PROPERTY, investorA.address, totalUnits + 1),
      );
    });

    it("prevents unauthorised allocation", async function () {
      await assert.rejects(
        allocation.connect(outsider).allocate(PROPERTY, outsider.address, 10),
      );
    });

    it("transfers units between investors via the operator", async function () {
      await allocation.connect(operator).allocate(PROPERTY, investorA.address, 100);
      await allocation
        .connect(operator)
        .transferUnits(PROPERTY, investorA.address, investorB.address, 40);

      assert.equal(Number(await allocation.balanceOf(PROPERTY, investorA.address)), 60);
      assert.equal(Number(await allocation.balanceOf(PROPERTY, investorB.address)), 40);
    });

    it("rejects transfers without enough units, to self, or from an outsider", async function () {
      await allocation.connect(operator).allocate(PROPERTY, investorA.address, 10);
      await assert.rejects(
        allocation.connect(operator).transferUnits(PROPERTY, investorA.address, investorB.address, 11),
      );
      await assert.rejects(
        allocation.connect(operator).transferUnits(PROPERTY, investorA.address, investorA.address, 1),
      );
      await assert.rejects(
        allocation
          .connect(outsider)
          .transferUnits(PROPERTY, investorA.address, outsider.address, 1),
      );
    });
  });

  describe("ResaleContract", function () {
    const pricePerUnit = 1_200n;

    beforeEach(async function () {
      await allocation.connect(operator).setPropertySupply(PROPERTY, 1_000);
      await allocation.connect(operator).allocate(PROPERTY, investorA.address, 200);
    });

    it("escrows units when a listing is created", async function () {
      await resale.connect(investorA).createListing(PROPERTY, 100, pricePerUnit);

      assert.equal(Number(await allocation.balanceOf(PROPERTY, investorA.address)), 100);
      assert.equal(
        Number(await allocation.balanceOf(PROPERTY, await resale.getAddress())),
        100,
      );
      const [propertyId, seller, units, price, , , status] = await resale.getListing(0);
      assert.equal(propertyId, PROPERTY);
      assert.equal(seller, investorA.address);
      assert.equal(Number(units), 100);
      assert.equal(price, pricePerUnit);
      assert.equal(Number(status), 1); // ACTIVE
    });

    it("rejects a listing for units the seller does not hold", async function () {
      await assert.rejects(
        resale.connect(investorB).createListing(PROPERTY, 10, pricePerUnit),
      );
    });

    it("rejects a listing when the escrow is not authorised", async function () {
      await allocation.setAuthorizedContract(await resale.getAddress(), false);
      await assert.rejects(
        resale.connect(investorA).createListing(PROPERTY, 10, pricePerUnit),
      );
    });

    it("reserves, then completes a resale and moves the units", async function () {
      await resale.connect(investorA).createListing(PROPERTY, 100, pricePerUnit);
      await resale.connect(investorB).reserveUnits(0);
      assert.equal(await resale.isReservationActive(0), true);

      await resale.connect(operator).completeResale(0, HASH_A);

      assert.equal(Number(await allocation.balanceOf(PROPERTY, investorB.address)), 100);
      assert.equal(
        Number(await allocation.balanceOf(PROPERTY, await resale.getAddress())),
        0,
      );
      const [, , units, , , , status] = await resale.getListing(0);
      assert.equal(Number(units), 0);
      assert.equal(Number(status), 3); // COMPLETED
    });

    it("does not let the seller reserve their own listing", async function () {
      await resale.connect(investorA).createListing(PROPERTY, 100, pricePerUnit);
      await assert.rejects(resale.connect(investorA).reserveUnits(0));
    });

    it("blocks a second buyer while a reservation is active", async function () {
      await resale.connect(investorA).createListing(PROPERTY, 100, pricePerUnit);
      await resale.connect(investorB).reserveUnits(0);
      await assert.rejects(resale.connect(outsider).reserveUnits(0));
    });

    it("rejects settlement after the reservation expires", async function () {
      await resale.connect(investorA).createListing(PROPERTY, 100, pricePerUnit);
      await resale.connect(investorB).reserveUnits(0);
      await increaseTime(16 * 60); // reservation period is 15 minutes

      assert.equal(await resale.isReservationActive(0), false);
      await assert.rejects(resale.connect(operator).completeResale(0, HASH_A));
    });

    it("refuses to settle a listing that was never reserved", async function () {
      await resale.connect(investorA).createListing(PROPERTY, 100, pricePerUnit);
      await assert.rejects(resale.connect(operator).completeResale(0, HASH_A));
    });

    it("only lets the operator settle a resale", async function () {
      await resale.connect(investorA).createListing(PROPERTY, 100, pricePerUnit);
      await resale.connect(investorB).reserveUnits(0);
      await assert.rejects(resale.connect(outsider).completeResale(0, HASH_A));
    });

    it("returns escrowed units when the seller cancels", async function () {
      await resale.connect(investorA).createListing(PROPERTY, 100, pricePerUnit);
      await resale.connect(investorA).cancelListing(0);

      assert.equal(Number(await allocation.balanceOf(PROPERTY, investorA.address)), 200);
      const [, , , , , , status] = await resale.getListing(0);
      assert.equal(Number(status), 4); // CANCELLED
    });

    it("does not let anyone but the seller cancel", async function () {
      await resale.connect(investorA).createListing(PROPERTY, 100, pricePerUnit);
      await assert.rejects(resale.connect(investorB).cancelListing(0));
    });

    it("lets the buyer release a reservation and the seller cancel afterwards", async function () {
      await resale.connect(investorA).createListing(PROPERTY, 100, pricePerUnit);
      await resale.connect(investorB).reserveUnits(0);
      await resale.connect(investorB).cancelReservation(0);

      assert.equal(await resale.isReservationActive(0), false);
      await resale.connect(investorA).cancelListing(0);
      assert.equal(Number(await allocation.balanceOf(PROPERTY, investorA.address)), 200);
    });
  });

  describe("end-to-end property lifecycle", function () {
    it("registers, funds, allocates and resells a property", async function () {
      await registry.connect(verifier).registerProperty(PROPERTY, HASH_A);
      await registry.connect(verifier).storeDocumentHash(PROPERTY, DOC_HASH, "title_deed");

      await pool.connect(operator).openPool(PROPERTY, 100_000n, 10_000n, 2_000n, 100);
      await allocation.connect(operator).setPropertySupply(PROPERTY, 100);

      await pool
        .connect(operator)
        .recordInvestment(PROPERTY, investorA.address, 10, 20_000n, HASH_A);
      await allocation.connect(operator).allocate(PROPERTY, investorA.address, 10);

      const [, , , raised, , sold] = await pool.getPool(PROPERTY);
      assert.equal(raised, 20_000n);
      assert.equal(Number(sold), 10);
      assert.equal(Number(await allocation.balanceOf(PROPERTY, investorA.address)), 10);
      assert.equal(Number(await allocation.ownershipBps(PROPERTY, investorA.address)), 1_000);

      await resale.connect(investorA).createListing(PROPERTY, 5, 2_500n);
      await resale.connect(investorB).reserveUnits(0);
      await resale.connect(operator).completeResale(0, HASH_B);

      assert.equal(Number(await allocation.balanceOf(PROPERTY, investorA.address)), 5);
      assert.equal(Number(await allocation.balanceOf(PROPERTY, investorB.address)), 5);
    });
  });
});
