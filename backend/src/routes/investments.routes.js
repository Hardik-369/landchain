import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { send, sendCreated } from "../lib/respond.js";
import { Validator } from "../lib/validate.js";
import { AppError } from "../lib/errors.js";
import {
  createInvestment,
  getInvestmentById,
  listHoldings,
  listInvestments,
  portfolioSummary,
} from "../services/investment.service.js";

export const investmentsRouter = Router();

/** GET /api/investments?userId= - the acting investor's records by default. */
investmentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const requested = req.query.userId;
    const userId = requested ?? req.user?.id;
    const investments = await listInvestments({ userId });
    res.set("X-Total-Count", String(investments.length));
    return send(res, investments);
  }),
);

/** GET /api/investments/summary - portfolio analytics. */
investmentsRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const userId = req.query.userId ?? req.user?.id;
    if (!userId) throw AppError.unauthorized("Sign in to view your portfolio.");
    return send(res, await portfolioSummary(userId));
  }),
);

/** GET /api/investments/holdings - units held per property. */
investmentsRouter.get(
  "/holdings",
  asyncHandler(async (req, res) => {
    const userId = req.query.userId ?? req.user?.id;
    if (!userId) throw AppError.unauthorized("Sign in to view your holdings.");
    return send(res, await listHoldings(userId));
  }),
);

/** GET /api/investments/:id */
investmentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => send(res, await getInvestmentById(req.params.id))),
);

/** POST /api/investments - buy units in the primary market. */
investmentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const propertyId = v.string("propertyId", { min: 3, max: 60 });
    const units = v.number("units", { integer: true, min: 1, max: 10_000_000 });
    const userId = v.string("userId", { required: false, max: 60 });
    v.done();

    const investment = await createInvestment({
      propertyId,
      units,
      userId: userId ?? req.user?.id,
      actor: req.user,
    });
    return sendCreated(res, investment, `/api/investments/${investment.id}`);
  }),
);
