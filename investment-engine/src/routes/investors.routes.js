import { Router } from "express";
import { Validator } from "../../../backend/src/lib/validate.js";
import { asyncHandler, send, sendCreated } from "./helpers.js";
import {
  getInvestor,
  investorHistory,
  listInvestors,
  registerInvestor,
} from "../services/investor.service.js";
import { investorHoldings } from "../services/ownership.service.js";

export const investorsRouter = Router();

/** GET /api/engine/investors?type=external&propertyId= */
investorsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const investors = await listInvestors({
      type: req.query.type,
      propertyId: req.query.propertyId,
    });
    res.set("X-Total-Count", String(investors.length));
    return send(res, investors);
  }),
);

/** POST /api/engine/investors - register an external investor. */
investorsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const payload = {
      userId: v.string("userId", { required: false, max: 60 }),
      name: v.string("name", { min: 2, max: 120 }),
      email: v.email("email", { required: false }),
      mobile: v.mobile("mobile", { required: false }),
      walletAddress: v.string("walletAddress", { required: false, max: 64 }),
      investorType: v.oneOf("investorType", ["external", "buyer"], {
        required: false,
        fallback: "external",
      }),
      kycStatus: v.oneOf("kycStatus", ["verified", "pending", "not_started", "rejected"], {
        required: false,
      }),
    };
    v.done();

    const investor = await registerInvestor(payload);
    return sendCreated(res, investor, `/api/engine/investors/${investor.userId}`);
  }),
);

/** GET /api/engine/investors/:userId */
investorsRouter.get(
  "/:userId",
  asyncHandler(async (req, res) => send(res, await getInvestor(req.params.userId))),
);

/** GET /api/engine/investors/:userId/history */
investorsRouter.get(
  "/:userId/history",
  asyncHandler(async (req, res) => send(res, await investorHistory(req.params.userId))),
);

/** GET /api/engine/investors/:userId/holdings */
investorsRouter.get(
  "/:userId/holdings",
  asyncHandler(async (req, res) => send(res, await investorHoldings(req.params.userId))),
);
