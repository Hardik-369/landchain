import { Router } from "express";
import { Validator } from "../../../backend/src/lib/validate.js";
import { AppError } from "../lib/errors.js";
import { asyncHandler, actorFrom, requireActor, send, sendCreated } from "./helpers.js";
import {
  availableUnitsForSeller,
  buyListing,
  cancelListing,
  createListing,
  getListing,
  listListings,
  releaseReservation,
  reserveListing,
  resaleHistory,
  resaleStats,
} from "../services/resale.service.js";

export const resaleRouter = Router();

/** GET /api/engine/resale/stats */
resaleRouter.get(
  "/stats",
  asyncHandler(async (req, res) => send(res, await resaleStats())),
);

/** GET /api/engine/resale/history?propertyId=&userId=&status= */
resaleRouter.get(
  "/history",
  asyncHandler(async (req, res) => {
    const records = await resaleHistory({
      propertyId: req.query.propertyId,
      userId: req.query.userId,
      status: req.query.status,
    });
    res.set("X-Total-Count", String(records.length));
    return send(res, records);
  }),
);

/** GET /api/engine/resale/available?sellerId=&propertyId= - listable balance. */
resaleRouter.get(
  "/available",
  asyncHandler(async (req, res) => {
    const sellerId = req.query.sellerId ?? actorFrom(req)?.id;
    if (!sellerId) throw AppError.unauthorized("A seller is required.");
    if (!req.query.propertyId) throw AppError.unprocessable("propertyId is required.");
    return send(
      res,
      await availableUnitsForSeller({ sellerId, propertyId: req.query.propertyId }),
    );
  }),
);

/** GET /api/engine/resale?status=active|sold|cancelled|all&propertyId=&sellerId= */
resaleRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const listings = await listListings({
      status: req.query.status,
      propertyId: req.query.propertyId,
      sellerId: req.query.sellerId,
    });
    res.set("X-Total-Count", String(listings.length));
    return send(res, listings);
  }),
);

/** POST /api/engine/resale - list units. The units are escrowed immediately. */
resaleRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const payload = {
      propertyId: v.string("propertyId", { min: 3, max: 60 }),
      units: v.number("units", { integer: true, min: 1, max: 1_000_000 }),
      pricePerUnit: v.number("pricePerUnit", { min: 1 }),
      sellerId: v.string("sellerId", { required: false, max: 60 }),
      sellerName: v.string("sellerName", { required: false, max: 120 }),
    };
    v.done();

    const actor = actorFrom(req);
    const sellerId = payload.sellerId ?? actor?.id;
    if (!sellerId) throw AppError.unauthorized("Sign in to list units for resale.");

    const listing = await createListing({ ...payload, sellerId });
    return sendCreated(res, listing, `/api/engine/resale/${listing.id}`);
  }),
);

/** GET /api/engine/resale/:id */
resaleRouter.get(
  "/:id",
  asyncHandler(async (req, res) => send(res, await getListing(req.params.id))),
);

/** POST /api/engine/resale/:id/reserve */
resaleRouter.post(
  "/:id/reserve",
  asyncHandler(async (req, res) => {
    const actor = requireActor(req, "Sign in to reserve a listing.");
    return send(res, await reserveListing(req.params.id, actor.id));
  }),
);

/** POST /api/engine/resale/:id/release */
resaleRouter.post(
  "/:id/release",
  asyncHandler(async (req, res) => {
    const actor = requireActor(req, "Sign in to release a reservation.");
    return send(res, await releaseReservation(req.params.id, actor));
  }),
);

/** POST /api/engine/resale/:id/cancel */
resaleRouter.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const actor = requireActor(req, "Sign in to cancel a listing.");
    return send(res, await cancelListing(req.params.id, actor));
  }),
);

/** POST /api/engine/resale/:id/buy - transfer existing units to the buyer. */
resaleRouter.post(
  "/:id/buy",
  asyncHandler(async (req, res) => {
    const actor = requireActor(req, "Sign in to purchase a resale listing.");
    return send(res, await buyListing(req.params.id, actor.id));
  }),
);
