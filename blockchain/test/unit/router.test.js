const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createBlockchainRouter } = require("../../src/api/router");
const { ValidationError } = require("../../src/errors");

async function withServer(service, run) {
  const app = express();
  app.use(express.json());
  app.use("/api/blockchain", createBlockchainRouter(express, service));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}/api/blockchain`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("serves health and network info", async () => {
  const service = {
    health: async () => ({ status: "ok" }),
    getNetworkInfo: async () => ({ network: "testnet", chainId: 296 }),
  };
  await withServer(service, async (base) => {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    const network = await fetch(`${base}/network`);
    assert.equal(network.status, 200);
    assert.equal((await network.json()).chainId, 296);
  });
});

test("register endpoint passes only allowlisted fields - keys cannot be injected", async () => {
  let received;
  const service = {
    registerProperty: async (body) => {
      received = body;
      return { propertyId: body.propertyId, transaction: { transactionHash: "0xabc" } };
    },
  };

  await withServer(service, async (base) => {
    const response = await fetch(`${base}/properties/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        propertyId: "LAND-2026-001",
        propertyHash: "ab".repeat(32),
        actor: "0.0.1234",
        signerKey: "SECRET",
        privateKey: "SECRET",
        HEDERA_OPERATOR_KEY: "SECRET",
      }),
    });

    assert.equal(response.status, 201);
    assert.deepEqual(Object.keys(received).sort(), ["actor", "propertyHash", "propertyId"]);
    assert.equal(JSON.stringify(received).includes("SECRET"), false);
  });
});

test("maps validation errors to 422 with the typed payload", async () => {
  const service = {
    registerProperty: async () => {
      throw new ValidationError("propertyHash must be a 32-byte digest.");
    },
  };

  await withServer(service, async (base) => {
    const response = await fetch(`${base}/properties/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ propertyId: "x" }),
    });
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.equal(body.error, "VALIDATION_ERROR");
    assert.match(body.message, /propertyHash/);
  });
});

test("unknown routes return 404", async () => {
  await withServer({}, async (base) => {
    const response = await fetch(`${base}/does-not-exist`);
    assert.equal(response.status, 404);
  });
});

test("requires the Express module to be injected", () => {
  assert.throws(() => createBlockchainRouter({}, {}), /requires the Express module/);
});
