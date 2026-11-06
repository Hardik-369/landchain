import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { resolveActor } from "../middleware/auth.js";
import { send, sendCreated } from "../lib/respond.js";
import { documentList, Validator } from "../lib/validate.js";
import { AppError } from "../lib/errors.js";
import { PROPERTY_CATEGORIES } from "../lib/constants.js";
import { store } from "../lib/store.js";
import {
  createProperty,
  getSellerPropertySummaries,
  getSellerStats,
  listSellerProperties,
} from "../services/property.service.js";

export const sellerRouter = Router();

/** Demo-friendly seller identity: authenticated user, ?sellerId=, or seeded seller. */
async function resolveSellerId(req) {
  if (req.auth?.user) return req.auth.user.id;
  if (req.query.sellerId) return req.query.sellerId;
  const users = await store.read("users");
  return users.find((user) => user.role === "seller")?.id ?? req.user?.id;
}

/** GET /api/seller/properties */
sellerRouter.get(
  "/properties",
  resolveActor,
  asyncHandler(async (req, res) => {
    const sellerId = await resolveSellerId(req);
    const properties = sellerId ? await getSellerPropertySummaries(sellerId) : [];
    res.set("X-Total-Count", String(properties.length));
    return send(res, properties);
  }),
);

/** POST /api/seller/properties - create a listing with documents. */
sellerRouter.post(
  "/properties",
  resolveActor,
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized("Sign in as a seller to add a property.");

    const v = new Validator(req.body);
    const payload = {
      title: v.string("title", { min: 3, max: 120 }),
      description: v.string("description", { required: false, max: 4000 }),
      address: v.string("address", { required: false, max: 300 }),
      city: v.string("city", { min: 2, max: 80 }),
      state: v.string("state", { required: false, max: 80 }),
      category: v.oneOf("category", PROPERTY_CATEGORIES),
      totalValue: v.number("totalValue", { min: 1_000_000 }),
      areaSqft: v.number("areaSqft", { min: 1 }),
      minInvestment: v.number("minInvestment", { min: 10_000 }),
      expectedYield: v.number("expectedYield", { min: 0, max: 50 }),
      documents: v.array("documents", { required: true, min: 1, max: 10 }),
    };
    v.done();

    const documents = documentList(req.body, "documents", {
      required: true,
      min: 1,
      max: 10,
    });

    const sellerId = req.auth?.user?.id ?? req.user.id;
    const property = await createProperty(
      { ...payload, documents, sellerId, sellerName: req.user.name },
      req.user,
      { requireDocuments: true },
    );
    return sendCreated(res, property, `/api/properties/${property.id}`);
  }),
);

/** GET /api/seller/stats */
sellerRouter.get(
  "/stats",
  resolveActor,
  asyncHandler(async (req, res) => {
    const sellerId = await resolveSellerId(req);
    if (!sellerId) return send(res, { portfolioValue: 0, totalRaised: 0, activeListings: 0, totalInvestors: 0, monthlyFunding: [] });
    return send(res, await getSellerStats(sellerId));
  }),
);

/** GET /api/seller/properties/:id - seller view of one listing. */
sellerRouter.get(
  "/properties/:id",
  asyncHandler(async (req, res) => {
    const properties = await listSellerProperties(await resolveSellerId(req));
    const property = properties.find((item) => item.id === req.params.id);
    if (!property) throw AppError.notFound(`Property ${req.params.id} was not found.`);
    return send(res, property);
  }),
);
