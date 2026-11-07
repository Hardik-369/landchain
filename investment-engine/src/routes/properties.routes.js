import { Router } from "express";
import { asyncHandler, send } from "./helpers.js";
import { listPooledProperties, propertyFunding } from "../services/pooling.service.js";
import { ownershipHistory, propertyOwnership } from "../services/ownership.service.js";
import { parsePagination } from "../../../backend/src/lib/validate.js";

export const propertiesRouter = Router();

/** GET /api/engine/properties?status= - funding progress for every property. */
propertiesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const properties = await listPooledProperties({ status: req.query.status });
    res.set("X-Total-Count", String(properties.length));
    return send(res, properties);
  }),
);

/** GET /api/engine/properties/:propertyId - pooling detail. */
propertiesRouter.get(
  "/:propertyId",
  asyncHandler(async (req, res) => send(res, await propertyFunding(req.params.propertyId))),
);

/** GET /api/engine/properties/:propertyId/funding */
propertiesRouter.get(
  "/:propertyId/funding",
  asyncHandler(async (req, res) => send(res, await propertyFunding(req.params.propertyId))),
);

/** GET /api/engine/properties/:propertyId/ownership */
propertiesRouter.get(
  "/:propertyId/ownership",
  asyncHandler(async (req, res) => send(res, await propertyOwnership(req.params.propertyId))),
);

/** GET /api/engine/properties/:propertyId/ownership-history?userId=&page=&limit= */
propertiesRouter.get(
  "/:propertyId/ownership-history",
  asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query, { defaultLimit: 100 });
    const records = await ownershipHistory({
      propertyId: req.params.propertyId,
      userId: req.query.userId,
    });
    const start = (page - 1) * limit;
    res.set("X-Total-Count", String(records.length));
    return send(res, records.slice(start, start + limit));
  }),
);
