import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireRole } from "../middleware/auth.js";
import { send, sendCreated } from "../lib/respond.js";
import { Validator } from "../lib/validate.js";
import { TRANSACTION_STATUSES, TRANSACTION_TYPES } from "../lib/constants.js";
import {
  getTransactionById,
  getTransactions,
  recordManualTransaction,
  toPublicTransaction,
} from "../services/transaction.service.js";

export const transactionsRouter = Router();

/** GET /api/transactions?userId=&propertyId=&type=&status= */
transactionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.query.userId ?? req.user?.id;
    const records = await getTransactions({
      userId,
      propertyId: req.query.propertyId,
      type: req.query.type,
      status: req.query.status,
    });
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const items = records.slice(0, Number.isFinite(limit) ? limit : undefined);
    res.set("X-Total-Count", String(records.length));
    return send(res, items.map(toPublicTransaction));
  }),
);

/** GET /api/transactions/:id */
transactionsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => send(res, await getTransactionById(req.params.id))),
);

/** POST /api/transactions - admin-only manual ledger entry. */
transactionsRouter.post(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const payload = {
      type: v.oneOf("type", TRANSACTION_TYPES),
      description: v.string("description", { min: 3, max: 300 }),
      amount: v.number("amount", { min: -1_000_000_000_000, max: 1_000_000_000_000 }),
      status: v.oneOf("status", TRANSACTION_STATUSES, { required: false, fallback: "completed" }),
      userId: v.string("userId", { required: false, max: 60 }),
      propertyId: v.string("propertyId", { required: false, max: 60 }),
      units: v.number("units", { required: false, integer: true, min: 0 }),
      reference: v.string("reference", { required: false, max: 120 }),
    };
    v.done();

    const transaction = await recordManualTransaction(payload, req.user);
    return sendCreated(res, transaction, `/api/transactions/${transaction.id}`);
  }),
);
