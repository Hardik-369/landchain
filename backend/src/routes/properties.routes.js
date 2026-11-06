import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireRole } from "../middleware/auth.js";
import { send, sendCreated, sendList } from "../lib/respond.js";
import { parsePagination, Validator } from "../lib/validate.js";
import {
  PROPERTY_CATEGORIES,
  PROPERTY_SORTS,
  PROPERTY_STATUSES,
} from "../lib/constants.js";
import { store } from "../lib/store.js";
import {
  createProperty,
  getPropertyById,
  getPropertyIntegrity,
  getPropertyVersions,
  listProperties,
  quotePropertyById,
  setPropertyStatus,
  updateProperty,
} from "../services/property.service.js";
import { documentsForProperty } from "../services/document.service.js";
import { listVerificationRecords } from "../services/verification.service.js";

export const propertiesRouter = Router();

/** GET /api/properties - listings with search, filters and sorting. */
propertiesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const filters = {
      search: req.query.search ?? req.query.q,
      city: req.query.city,
      state: req.query.state,
      category: req.query.category,
      status: req.query.status,
      sellerId: req.query.sellerId,
      minInvestment: req.query.minInvestment,
      maxInvestment: req.query.maxInvestment,
      featured: req.query.featured === "true" || req.query.featured === "1",
      sort: req.query.sort,
    };

    let properties = await listProperties(filters);
    const total = properties.length;
    const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 100 });
    properties = properties.slice(offset, offset + limit);
    return sendList(res, properties, { page, limit, total });
  }),
);

/** POST /api/properties - create a listing (seller/admin). */
propertiesRouter.post(
  "/",
  requireRole("seller", "admin"),
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const payload = {
      title: v.string("title", { min: 3, max: 120 }),
      description: v.string("description", { required: false, max: 4000 }),
      address: v.string("address", { required: false, max: 300 }),
      city: v.string("city", { min: 2, max: 80 }),
      state: v.string("state", { required: false, max: 80 }),
      category: v.oneOf("category", PROPERTY_CATEGORIES),
      totalValue: v.number("totalValue", { min: 1_000_000 }),
      areaSqft: v.number("areaSqft", { min: 1 }),
      minInvestment: v.number("minInvestment", { min: 10_000 }),
      expectedYield: v.number("expectedYield", { min: 0, max: 50 }),
      expectedAppreciation: v.number("expectedAppreciation", { required: false, min: 0, max: 50 }),
      highlights: v.array("highlights", { required: false, max: 6 }),
      documents: v.array("documents", { required: false, max: 10 }),
    };
    v.done();

    const property = await createProperty(
      { ...payload, documents: payload.documents ?? [] },
      req.user,
      { requireDocuments: false },
    );
    return sendCreated(res, property, `/api/properties/${property.id}`);
  }),
);

/** GET /api/properties/:id/quote?units= */
propertiesRouter.get(
  "/:id/quote",
  asyncHandler(async (req, res) => {
    const units = req.query.units === undefined ? 0 : Number(req.query.units);
    const quote = await quotePropertyById(req.params.id, units);
    return send(res, quote);
  }),
);

/** GET /api/properties/:id/documents */
propertiesRouter.get(
  "/:id/documents",
  asyncHandler(async (req, res) => {
    const documents = await store.read("documents");
    await getPropertyById(req.params.id);
    const list = documentsForProperty(documents, req.params.id);
    res.set("X-Total-Count", String(list.length));
    return send(res, list);
  }),
);

/** GET /api/properties/:id/versions - registry hash versions. */
propertiesRouter.get(
  "/:id/versions",
  asyncHandler(async (req, res) => send(res, await getPropertyVersions(req.params.id))),
);

/** GET /api/properties/:id/integrity - verify the hash chain. */
propertiesRouter.get(
  "/:id/integrity",
  asyncHandler(async (req, res) => send(res, await getPropertyIntegrity(req.params.id))),
);

/** GET /api/properties/:id/history - verification + hash activity. */
propertiesRouter.get(
  "/:id/history",
  asyncHandler(async (req, res) => {
    const { verificationRecords: records, propertyHashes: hashes } = await store.readMany([
      "verificationRecords",
      "propertyHashes",
    ]);
    await getPropertyById(req.params.id);
    return send(res, {
      propertyId: req.params.id,
      verification: listVerificationRecords(records, { propertyId: req.params.id }).reverse(),
      versions: hashes
        .filter((hash) => hash.propertyId === req.params.id)
        .sort((a, b) => a.version - b.version),
    });
  }),
);

/** GET /api/properties/:id */
propertiesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => send(res, await getPropertyById(req.params.id))),
);

/** PATCH /api/properties/:id - update details (seller owner/admin). */
propertiesRouter.patch(
  "/:id",
  requireRole("seller", "admin"),
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const patch = {
      title: v.string("title", { required: false, min: 3, max: 120 }),
      description: v.string("description", { required: false, max: 4000 }),
      address: v.string("address", { required: false, max: 300 }),
      city: v.string("city", { required: false, min: 2, max: 80 }),
      state: v.string("state", { required: false, max: 80 }),
      category: v.oneOf("category", PROPERTY_CATEGORIES, { required: false }),
      totalValue: v.number("totalValue", { required: false, min: 1_000_000 }),
      areaSqft: v.number("areaSqft", { required: false, min: 1 }),
      minInvestment: v.number("minInvestment", { required: false, min: 10_000 }),
      expectedYield: v.number("expectedYield", { required: false, min: 0, max: 50 }),
      expectedAppreciation: v.number("expectedAppreciation", { required: false, min: 0, max: 50 }),
      highlights: v.array("highlights", { required: false, max: 6 }),
    };
    v.done();

    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    if (!Object.keys(clean).length) {
      const { AppError } = await import("../lib/errors.js");
      throw AppError.unprocessable("No updatable fields were supplied.");
    }
    return send(res, await updateProperty(req.params.id, clean, req.user));
  }),
);

/** PATCH /api/properties/:id/status - manage listing status. */
propertiesRouter.patch(
  "/:id/status",
  requireRole("seller", "admin"),
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const status = v.oneOf("status", PROPERTY_STATUSES);
    const note = v.string("note", { required: false, max: 300 });
    v.done();

    return send(res, await setPropertyStatus(req.params.id, status, req.user, { note }));
  }),
);

export { PROPERTY_SORTS };
