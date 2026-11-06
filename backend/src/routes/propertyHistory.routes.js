import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireRole } from "../middleware/auth.js";
import { send, sendCreated } from "../lib/respond.js";
import { Validator } from "../lib/validate.js";
import { AppError } from "../lib/errors.js";
import { store } from "../lib/store.js";
import { makeId } from "../lib/ids.js";
import { findProperty } from "../lib/records.js";

export const propertyHistoryRouter = Router();

const HISTORY_TYPES = [
  "primary_allocation",
  "resale_transfer",
  "manual_adjustment",
  "token_allocation",
];

/** GET /api/property-history?propertyId=&userId=&type= */
propertyHistoryRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const records = await store.read("ownershipHistory");
    const filtered = records
      .filter((record) =>
        req.query.propertyId ? record.propertyId === req.query.propertyId : true,
      )
      .filter((record) =>
        req.query.userId
          ? record.toUserId === req.query.userId || record.fromUserId === req.query.userId
          : true,
      )
      .filter((record) => (req.query.type ? record.type === req.query.type : true))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.set("X-Total-Count", String(filtered.length));
    return send(res, filtered);
  }),
);

/** GET /api/property-history/:propertyId - chain of ownership for one asset. */
propertyHistoryRouter.get(
  "/:propertyId",
  asyncHandler(async (req, res) => {
    const { ownershipHistory: records, properties } = await store.readMany([
      "ownershipHistory",
      "properties",
    ]);
    const property = properties.find((candidate) => candidate.id === req.params.propertyId);
    if (!property) {
      throw AppError.notFound(`Property ${req.params.propertyId} was not found.`);
    }

    const history = records
      .filter((record) => record.propertyId === req.params.propertyId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return send(res, {
      propertyId: property.id,
      propertyTitle: property.title,
      version: property.version,
      propertyHash: property.propertyHash,
      entries: history,
      totalUnitsAllocated: history
        .filter((record) => record.toUserId)
        .reduce((sum, record) => sum + record.units, 0),
    });
  }),
);

/** POST /api/property-history - admin-only manual append (corrections/imports). */
propertyHistoryRouter.post(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const payload = {
      propertyId: v.string("propertyId", { min: 3, max: 60 }),
      type: v.oneOf("type", HISTORY_TYPES),
      units: v.number("units", { integer: true, min: 1 }),
      toUserId: v.string("toUserId", { required: false, max: 60 }),
      fromUserId: v.string("fromUserId", { required: false, max: 60 }),
      note: v.string("note", { required: false, max: 300 }),
    };
    v.done();

    const record = await store.transact(
      ["ownershipHistory", "properties"],
      (drafts) => {
        const property = findProperty(drafts.properties, payload.propertyId);
        const entry = {
          id: makeId("OWN"),
          propertyId: property.id,
          type: payload.type,
          units: payload.units,
          fromUserId: payload.fromUserId ?? null,
          toUserId: payload.toUserId ?? null,
          investmentId: null,
          transactionId: null,
          pricePerUnit: property.unitPrice,
          ownershipPercent: Number(
            ((payload.units / property.totalUnits) * 100).toFixed(4),
          ),
          propertyVersion: property.version,
          note: payload.note ?? "Manual ownership adjustment.",
          createdAt: new Date().toISOString(),
          createdBy: req.user?.id ?? "system",
        };
        drafts.ownershipHistory.push(entry);
        return entry;
      },
    );

    return sendCreated(res, record, `/api/property-history/${record.id}`);
  }),
);
