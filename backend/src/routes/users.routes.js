import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireRole, requireSelfOrAdmin } from "../middleware/auth.js";
import { send, sendList } from "../lib/respond.js";
import { parsePagination, Validator } from "../lib/validate.js";
import { KYC_STATUSES, ROLES } from "../lib/constants.js";
import { store } from "../lib/store.js";
import {
  getUserById,
  listUsers,
  setUserRole,
  toPublicUser,
  updateUser,
} from "../services/user.service.js";
import { listInvestments } from "../services/investment.service.js";
import { assertRole } from "../services/verification.service.js";

export const usersRouter = Router();

/** GET /api/users - directory (admin), paginated via headers. */
usersRouter.get(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const users = await store.read("users");
    const filtered = listUsers(users, {
      role: req.query.role,
      kycStatus: req.query.kycStatus,
      status: req.query.status,
      search: req.query.search ?? req.query.q,
    });
    const { page, limit, offset } = parsePagination(req.query);
    const pageItems = filtered.slice(offset, offset + limit).map((user) => toPublicUser(user));
    return sendList(res, pageItems, { page, limit, total: filtered.length });
  }),
);

/** GET /api/users/me - the acting user. */
usersRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    if (!req.user) return send(res, null, 200);
    const user = await getUserById(req.user.id);
    return send(res, user);
  }),
);

/** PATCH /api/users/me */
usersRouter.patch(
  "/me",
  asyncHandler(async (req, res) => {
    if (!req.user) return send(res, null, 200);
    const v = new Validator(req.body);
    const patch = {
      name: v.string("name", { required: false, min: 2, max: 80 }),
      email: v.email("email"),
      walletAddress: v.wallet("walletAddress", { required: false }),
    };
    v.done();

    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    return send(res, await updateUser(req.user.id, clean, { actor: req.user }));
  }),
);

/** GET /api/users/:id */
usersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = await getUserById(req.params.id);
    if (!user) {
      const { AppError } = await import("../lib/errors.js");
      throw AppError.notFound(`User ${req.params.id} was not found.`);
    }
    return send(res, user);
  }),
);

/** PATCH /api/users/:id - profile fields (self or admin). */
usersRouter.patch(
  "/:id",
  requireSelfOrAdmin("id"),
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const patch = {
      name: v.string("name", { required: false, min: 2, max: 80 }),
      email: v.email("email"),
      walletAddress: v.wallet("walletAddress", { required: false }),
      kycStatus: v.oneOf("kycStatus", KYC_STATUSES, { required: false }),
      status: v.oneOf("status", ["active", "suspended"], { required: false }),
    };
    v.done();

    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    if (clean.kycStatus || clean.status) {
      if (req.user?.role !== "admin") {
        const { AppError } = await import("../lib/errors.js");
        throw AppError.forbidden("Only an admin can change KYC or account status.");
      }
    }
    return send(res, await updateUser(req.params.id, clean, { actor: req.user }));
  }),
);

/** PATCH /api/users/:id/role - role management (admin). */
usersRouter.patch(
  "/:id/role",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const role = v.oneOf("role", ROLES);
    v.done();
    return send(res, await setUserRole(req.params.id, assertRole(role)));
  }),
);

/** GET /api/users/:id/investments */
usersRouter.get(
  "/:id/investments",
  requireSelfOrAdmin("id"),
  asyncHandler(async (req, res) => {
    const investments = await listInvestments({ userId: req.params.id });
    res.set("X-Total-Count", String(investments.length));
    return send(res, investments);
  }),
);
