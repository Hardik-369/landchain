import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireRole } from "../middleware/auth.js";
import { send, sendCreated } from "../lib/respond.js";
import { Validator } from "../lib/validate.js";
import { DOCUMENT_STATUSES } from "../lib/constants.js";
import {
  createDocument,
  getDocument,
  listDocuments,
  setDocumentStatus,
} from "../services/document.service.js";

export const documentsRouter = Router();

/** POST /api/documents - accept a fictional upload and store its SHA-256. */
documentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const payload = {
      propertyId: v.string("propertyId", { required: false, max: 60 }),
      name: v.string("name", { min: 2, max: 120 }),
      type: v.string("type", { required: false, max: 20, trim: true }),
      size: v.string("size", { required: false, max: 20 }),
      content: v.string("content", { required: false, max: 100_000, trim: false }),
      status: v.oneOf("status", DOCUMENT_STATUSES, { required: false, fallback: "pending" }),
    };
    v.done();

    const document = await createDocument(payload, req.user);
    return sendCreated(res, document, `/api/documents/${document.id}`);
  }),
);

/** GET /api/documents?propertyId=&status=&hashesOnly=true */
documentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const documents = await listDocuments({
      propertyId: req.query.propertyId,
      status: req.query.status,
      ownerId: req.query.ownerId,
      hashesOnly: req.query.hashesOnly === "true" || req.query.hashesOnly === "1",
    });
    res.set("X-Total-Count", String(documents.length));
    return send(res, documents);
  }),
);

/** GET /api/documents/:id */
documentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => send(res, await getDocument(req.params.id))),
);

/** PATCH /api/documents/:id/verification - admin verification status. */
documentsRouter.patch(
  "/:id/verification",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const status = v.oneOf("status", DOCUMENT_STATUSES);
    const note = v.string("note", { required: false, max: 300 });
    v.done();

    return send(res, await setDocumentStatus(req.params.id, { status, note }, req.user));
  }),
);
