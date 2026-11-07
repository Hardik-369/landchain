import { Router } from "express";
import { Validator } from "../../../backend/src/lib/validate.js";
import { AppError } from "../lib/errors.js";
import { asyncHandler, actorFrom, requireActor, send, sendCreated } from "./helpers.js";
import {
  createInvestment,
  getInvestment,
  listInvestments,
  quoteInvestment,
  releaseStaleReservations,
} from "../services/investment.service.js";

export const investmentsRouter = Router();

function investmentPayload(req) {
  const v = new Validator(req.body);
  const payload = {
    propertyId: v.string("propertyId", { min: 3, max: 60 }),
    units: v.number("units", { integer: true, min: 1, max: 1_000_000 }),
    userId: v.string("userId", { required: false, max: 60 }),
    investorType: v.oneOf("investorType", ["buyer", "external"], { required: false }),
  };
  v.done();
  return payload;
}

/** POST /api/engine/investments/quote - thresholds and eligibility, no writes. */
investmentsRouter.post(
  "/quote",
  asyncHandler(async (req, res) => {
    const payload = investmentPayload(req);
    const actor = actorFrom(req);
    const userId = payload.userId ?? actor?.id;
    if (!userId) throw AppError.unauthorized("An investor is required.");
    return send(
      res,
      await quoteInvestment({
        propertyId: payload.propertyId,
        userId,
        units: payload.units,
        investorType: payload.investorType,
      }),
    );
  }),
);

/** POST /api/engine/investments - buy units in the primary market. */
investmentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const payload = investmentPayload(req);
    const actor = actorFrom(req);
    const userId = payload.userId ?? actor?.id;
    if (!userId) throw AppError.unauthorized("Sign in to invest.");

    const investment = await createInvestment({
      propertyId: payload.propertyId,
      userId,
      units: payload.units,
      investorType: payload.investorType,
    });
    return sendCreated(res, investment, `/api/engine/investments/${investment.id}`);
  }),
);

/** GET /api/engine/investments?userId=&propertyId=&status= */
investmentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const actor = actorFrom(req);
    const investments = await listInvestments({
      userId: req.query.userId ?? actor?.id,
      propertyId: req.query.propertyId,
      status: req.query.status,
    });
    res.set("X-Total-Count", String(investments.length));
    return send(res, investments);
  }),
);

/** GET /api/engine/investments/:id */
investmentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => send(res, await getInvestment(req.params.id))),
);

/** POST /api/engine/investments/release-stale - release expired reservations. */
investmentsRouter.post(
  "/release-stale",
  asyncHandler(async (req, res) => {
    requireActor(req);
    return send(res, { released: await releaseStaleReservations() });
  }),
);
