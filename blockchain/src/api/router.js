/**
 * Express adapter for the blockchain service.
 *
 * Contributor 2 can mount this without touching any blockchain internals:
 *
 *   import express from "express";
 *   import { createBlockchainRouter } from "../../blockchain/src/api/router.js";
 *   app.use("/api/blockchain", createBlockchainRouter(express));
 *
 * `express` is injected so this package does not pin its own Express version.
 *
 * Security: request bodies are read through an explicit allowlist - no private
 * key or signer field can ever reach the service from HTTP.
 */
const { getBlockchainService } = require("../services/blockchain.service");
const { BlockchainError } = require("../errors");

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function pick(source, keys) {
  const result = {};
  for (const key of keys) {
    if (source?.[key] !== undefined) result[key] = source[key];
  }
  return result;
}

function createBlockchainRouter(express, service = getBlockchainService()) {
  if (!express?.Router) {
    throw new Error("createBlockchainRouter(express, service?) requires the Express module.");
  }
  const router = express.Router();

  // ---------------------------------------------------------------------
  // Diagnostics
  // ---------------------------------------------------------------------
  router.get("/health", asyncHandler(async (req, res) => res.json(await service.health())));
  router.get("/network", asyncHandler(async (req, res) => res.json(await service.getNetworkInfo())));

  // ---------------------------------------------------------------------
  // Wallet
  // ---------------------------------------------------------------------
  router.post(
    "/wallet/connect",
    asyncHandler(async (req, res) => {
      const { accountId } = pick(req.body, ["accountId"]);
      res.json(await service.connectWallet({ accountId }));
    }),
  );

  router.get(
    "/accounts/:accountId",
    asyncHandler(async (req, res) => {
      res.json(await service.getAccountInfo(req.params.accountId));
    }),
  );

  router.get(
    "/accounts/:accountId/transactions",
    asyncHandler(async (req, res) => {
      res.json(
        await service.getTransactionHistory({
          accountId: req.params.accountId,
          limit: Number(req.query.limit) || 25,
          order: req.query.order === "asc" ? "asc" : "desc",
        }),
      );
    }),
  );

  router.get(
    "/accounts/:accountId/tokens",
    asyncHandler(async (req, res) => {
      res.json(await service.getAccountTokens(req.params.accountId));
    }),
  );

  // ---------------------------------------------------------------------
  // Property registry
  // ---------------------------------------------------------------------
  router.post(
    "/properties/register",
    asyncHandler(async (req, res) => {
      const body = pick(req.body, ["propertyId", "propertyHash", "actor", "metadata"]);
      res.status(201).json(await service.registerProperty(body));
    }),
  );

  router.get(
    "/properties/:propertyId/registry",
    asyncHandler(async (req, res) => {
      res.json(
        await service.getPropertyRecord({
          propertyId: req.params.propertyId,
          propertyHash: req.query.hash,
        }),
      );
    }),
  );

  router.put(
    "/properties/:propertyId/hash",
    asyncHandler(async (req, res) => {
      const body = pick(req.body, ["propertyHash", "actor", "metadata"]);
      res.json(await service.updatePropertyHash({ propertyId: req.params.propertyId, ...body }));
    }),
  );

  router.post(
    "/properties/:propertyId/documents",
    asyncHandler(async (req, res) => {
      const body = pick(req.body, ["documentHash", "documentType", "actor", "metadata"]);
      res.status(201).json(
        await service.storeDocumentHash({ propertyId: req.params.propertyId, ...body }),
      );
    }),
  );

  router.post(
    "/properties/:propertyId/events",
    asyncHandler(async (req, res) => {
      const body = pick(req.body, ["eventType", "data", "actor"]);
      res.status(201).json(
        await service.recordPropertyEvent({ propertyId: req.params.propertyId, ...body }),
      );
    }),
  );

  router.get(
    "/properties/:propertyId/events",
    asyncHandler(async (req, res) => {
      res.json(
        await service.getPropertyEvents({
          propertyId: req.params.propertyId,
          limit: Number(req.query.limit) || 50,
          order: req.query.order === "desc" ? "desc" : "asc",
        }),
      );
    }),
  );

  router.post(
    "/properties/:propertyId/configure",
    asyncHandler(async (req, res) => {
      const body = pick(req.body, [
        "totalUnits",
        "targetAmount",
        "minInvestment",
        "unitPrice",
        "actor",
      ]);
      res.status(201).json(
        await service.configurePropertyOnChain({ propertyId: req.params.propertyId, ...body }),
      );
    }),
  );

  router.get(
    "/properties/:propertyId/pool",
    asyncHandler(async (req, res) => {
      res.json(await service.getInvestmentPool(req.params.propertyId));
    }),
  );

  router.post(
    "/properties/:propertyId/investments",
    asyncHandler(async (req, res) => {
      const body = pick(req.body, [
        "investorAccountId",
        "units",
        "amount",
        "paymentRef",
        "actor",
      ]);
      res.status(201).json(
        await service.recordInvestment({ propertyId: req.params.propertyId, ...body }),
      );
    }),
  );

  router.get(
    "/properties/:propertyId/allocation",
    asyncHandler(async (req, res) => {
      res.json(
        await service.getAllocation({
          propertyId: req.params.propertyId,
          investorAccountId: req.query.accountId,
        }),
      );
    }),
  );

  // ---------------------------------------------------------------------
  // Tokens
  // ---------------------------------------------------------------------
  router.post(
    "/properties/:propertyId/tokens",
    asyncHandler(async (req, res) => {
      const body = pick(req.body, ["name", "symbol", "totalUnits", "actor"]);
      res.status(201).json(
        await service.createPropertyToken({ propertyId: req.params.propertyId, ...body }),
      );
    }),
  );

  router.post(
    "/properties/:propertyId/allocate",
    asyncHandler(async (req, res) => {
      const body = pick(req.body, ["tokenId", "investorAccountId", "units", "actor", "metadata"]);
      res.status(201).json(
        await service.allocateUnits({ propertyId: req.params.propertyId, ...body }),
      );
    }),
  );

  router.post(
    "/tokens/:tokenId/transfer",
    asyncHandler(async (req, res) => {
      const body = pick(req.body, [
        "propertyId",
        "fromAccountId",
        "toAccountId",
        "units",
        "actor",
        "metadata",
      ]);
      res.json(await service.transferUnits({ tokenId: req.params.tokenId, ...body }));
    }),
  );

  router.get(
    "/tokens/:tokenId/balance/:accountId",
    asyncHandler(async (req, res) => {
      res.json(
        await service.getTokenBalance({
          tokenId: req.params.tokenId,
          accountId: req.params.accountId,
        }),
      );
    }),
  );

  router.get(
    "/tokens/:tokenId",
    asyncHandler(async (req, res) => {
      res.json(await service.getTokenInfo(req.params.tokenId));
    }),
  );

  // ---------------------------------------------------------------------
  // Transactions & explorer
  // ---------------------------------------------------------------------
  router.get(
    "/transactions/:reference",
    asyncHandler(async (req, res) => {
      res.json(await service.getTransaction(req.params.reference));
    }),
  );

  router.get(
    "/transactions/:reference/status",
    asyncHandler(async (req, res) => {
      res.json(await service.getTransactionStatus(req.params.reference));
    }),
  );

  router.get(
    "/explorer-links",
    asyncHandler(async (req, res) => {
      res.json(
        service.getExplorerLinks({
          transactionId: req.query.transactionId,
          accountId: req.query.accountId,
          tokenId: req.query.tokenId,
          topicId: req.query.topicId,
          contractAddress: req.query.contract,
        }),
      );
    }),
  );

  // ---------------------------------------------------------------------
  // Resale escrow
  // ---------------------------------------------------------------------
  router.get(
    "/resale/:listingId",
    asyncHandler(async (req, res) => {
      res.json(await service.getResaleListing(req.params.listingId));
    }),
  );

  router.post(
    "/resale/listings",
    asyncHandler(async (req, res) => {
      const body = pick(req.body, ["propertyId", "units", "pricePerUnit", "actor"]);
      res.status(201).json(await service.createResaleListing(body));
    }),
  );

  router.post(
    "/resale/:listingId/reserve",
    asyncHandler(async (req, res) => {
      res.json(await service.reserveUnits({ listingId: req.params.listingId }));
    }),
  );

  router.post(
    "/resale/:listingId/cancel",
    asyncHandler(async (req, res) => {
      res.json(await service.cancelListing({ listingId: req.params.listingId }));
    }),
  );

  router.post(
    "/resale/:listingId/complete",
    asyncHandler(async (req, res) => {
      const { paymentRef, actor } = pick(req.body, ["paymentRef", "actor"]);
      res.json(
        await service.completeResale({ listingId: req.params.listingId, paymentRef, actor }),
      );
    }),
  );

  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof BlockchainError ? error.status : 500;
    const payload =
      error instanceof BlockchainError
        ? error.toJSON()
        : { error: "INTERNAL_ERROR", message: "Blockchain request failed." };
    if (status >= 500) console.error("[blockchain]", error.message);
    return res.status(status).json(payload);
  });

  return router;
}

module.exports = { createBlockchainRouter };
