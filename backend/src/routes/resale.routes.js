import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { resolveActor } from "../middleware/auth.js";
import { send, sendCreated } from "../lib/respond.js";
import { Validator } from "../lib/validate.js";
import { AppError } from "../lib/errors.js";
import {
  buyResaleListing,
  cancelResaleListing,
  createResaleListing,
  getResaleListing,
  listResaleListings,
  resaleStats,
} from "../services/resale.service.js";

export const resaleRouter = Router();

/** GET /api/resale/stats */
resaleRouter.get(
  "/stats",
  asyncHandler(async (req, res) => send(res, await resaleStats())),
);

/** GET /api/resale?status=active|sold|cancelled|all */
resaleRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const listings = await listResaleListings({ status: req.query.status });
    res.set("X-Total-Count", String(listings.length));
    return send(res, listings);
  }),
);

/** POST /api/resale - list units for resale. */
resaleRouter.post(
  "/",
  resolveActor,
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const payload = {
      propertyId: v.string("propertyId", { min: 3, max: 60 }),
      units: v.number("units", { integer: true, min: 1 }),
      pricePerUnit: v.number("pricePerUnit", { min: 1 }),
      sellerName: v.string("sellerName", { required: false, max: 80 }),
    };
    v.done();

    if (!req.user) throw AppError.unauthorized("Sign in to list units for resale.");
    const listing = await createResaleListing(payload, req.user);
    return sendCreated(res, listing, `/api/resale/${listing.id}`);
  }),
);

/** GET /api/resale/:id */
resaleRouter.get(
  "/:id",
  asyncHandler(async (req, res) => send(res, await getResaleListing(req.params.id))),
);

/** DELETE /api/resale/:id - cancel an active listing. */
resaleRouter.delete(
  "/:id",
  resolveActor,
  asyncHandler(async (req, res) =>
    send(res, await cancelResaleListing(req.params.id, req.user)),
  ),
);

/** POST /api/resale/:id/buy - purchase a listing (transfers units). */
resaleRouter.post(
  "/:id/buy",
  resolveActor,
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized("Sign in to purchase a resale listing.");
    return send(res, await buyResaleListing(req.params.id, req.user));
  }),
);
