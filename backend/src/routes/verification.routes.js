import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { optionalAuth, requireRole, resolveActor } from "../middleware/auth.js";
import { send } from "../lib/respond.js";
import { Validator } from "../lib/validate.js";
import { AppError } from "../lib/errors.js";
import { VERIFICATION_STATUSES } from "../lib/constants.js";
import {
  decidePropertyVerification,
  getPropertyVerificationHistory,
  listVerificationRecordsPublic,
} from "../services/verification.service.js";
import { verifyPan } from "../services/auth.service.js";

export const verificationRouter = Router();

/** GET /api/verification?propertyId=&status= */
verificationRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const status = req.query.status;
    if (status && !VERIFICATION_STATUSES.includes(status)) {
      throw AppError.unprocessable(
        `Status must be one of: ${VERIFICATION_STATUSES.join(", ")}.`,
      );
    }
    const records = await listVerificationRecordsPublic({
      propertyId: req.query.propertyId,
      status,
      actorId: req.query.actorId,
    });
    res.set("X-Total-Count", String(records.length));
    return send(res, records);
  }),
);

/** POST /api/verification/pan - simulated PAN check. */
verificationRouter.post(
  "/pan",
  optionalAuth,
  resolveActor,
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const pan = v.pan("pan");
    v.done();
    return send(res, await verifyPan(pan, req.auth?.user ?? null));
  }),
);

/** POST /api/verification/:propertyId/verify - approve or reject a property. */
verificationRouter.post(
  "/:propertyId/verify",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const action = v.oneOf("action", ["approve", "reject"]);
    const note = v.string("note", { required: false, max: 500 });
    v.done();

    return send(
      res,
      await decidePropertyVerification(req.params.propertyId, { action, note }, req.user),
    );
  }),
);

/** GET /api/verification/:propertyId - audit trail for one property. */
verificationRouter.get(
  "/:propertyId",
  asyncHandler(async (req, res) =>
    send(res, await getPropertyVerificationHistory(req.params.propertyId)),
  ),
);
