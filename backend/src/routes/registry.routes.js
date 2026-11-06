import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { send } from "../lib/respond.js";
import { getRegistryEntries, getRegistryRecord } from "../services/registry.service.js";

export const registryRouter = Router();

/** GET /api/registry - public register of all property hashes. */
registryRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const entries = await getRegistryEntries();
    res.set("X-Total-Count", String(entries.length));
    return send(res, entries);
  }),
);

/** GET /api/registry/:id - registry record with hashes and timeline. */
registryRouter.get(
  "/:id",
  asyncHandler(async (req, res) => send(res, await getRegistryRecord(req.params.id))),
);
