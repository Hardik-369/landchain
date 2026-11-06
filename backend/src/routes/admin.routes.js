import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireRole } from "../middleware/auth.js";
import { send } from "../lib/respond.js";
import { Validator } from "../lib/validate.js";
import { AppError } from "../lib/errors.js";
import { PROPERTY_STATUSES } from "../lib/constants.js";
import {
  getAdminStats,
  getAdminUsers,
  getPlatformSettings,
  getVerificationQueue,
  listDataBackups,
  updatePlatformSettings,
} from "../services/admin.service.js";
import { decidePropertyVerification } from "../services/verification.service.js";
import { getTransactions, toPublicTransaction } from "../services/transaction.service.js";
import { listInvestments } from "../services/investment.service.js";

export const adminRouter = Router();

adminRouter.use(requireRole("admin"));

/** GET /api/admin/stats */
adminRouter.get(
  "/stats",
  asyncHandler(async (req, res) => send(res, await getAdminStats())),
);

/** GET /api/admin/users */
adminRouter.get(
  "/users",
  asyncHandler(async (req, res) => {
    const users = await getAdminUsers();
    res.set("X-Total-Count", String(users.length));
    return send(res, users);
  }),
);

/** GET /api/admin/properties?status= */
adminRouter.get(
  "/properties",
  asyncHandler(async (req, res) => {
    const status = req.query.status ?? "pending_verification";
    if (!PROPERTY_STATUSES.includes(status)) {
      throw AppError.unprocessable(
        `Status must be one of: ${PROPERTY_STATUSES.join(", ")}.`,
      );
    }
    const properties = await getVerificationQueue(status);
    res.set("X-Total-Count", String(properties.length));
    return send(res, properties);
  }),
);

/** POST /api/admin/properties/:id/verify */
adminRouter.post(
  "/properties/:id/verify",
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const action = v.oneOf("action", ["approve", "reject"]);
    const note = v.string("note", { required: false, max: 500 });
    v.done();

    return send(
      res,
      await decidePropertyVerification(req.params.id, { action, note }, req.user),
    );
  }),
);

/** GET /api/admin/transactions */
adminRouter.get(
  "/transactions",
  asyncHandler(async (req, res) => {
    const records = await getTransactions({
      userId: req.query.userId,
      propertyId: req.query.propertyId,
      type: req.query.type,
      status: req.query.status,
    });
    res.set("X-Total-Count", String(records.length));
    return send(res, records.map(toPublicTransaction));
  }),
);

/** GET /api/admin/investments */
adminRouter.get(
  "/investments",
  asyncHandler(async (req, res) => {
    const investments = await listInvestments({ userId: req.query.userId });
    res.set("X-Total-Count", String(investments.length));
    return send(res, investments);
  }),
);

/** GET /api/admin/settings */
adminRouter.get(
  "/settings",
  asyncHandler(async (req, res) => send(res, await getPlatformSettings())),
);

/** PATCH /api/admin/settings (PUT is an alias) */
const saveSettings = asyncHandler(async (req, res) => {
  const settings = await updatePlatformSettings(req.body, req.user);
  return send(res, settings);
});
adminRouter.patch("/settings", saveSettings);
adminRouter.put("/settings", saveSettings);

/** GET /api/admin/backups - recent JSON backups taken before writes. */
adminRouter.get(
  "/backups",
  asyncHandler(async (req, res) => {
    const backups = await listDataBackups();
    return send(res, backups.slice(0, Number(req.query.limit ?? 25)));
  }),
);
