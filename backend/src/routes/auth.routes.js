import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { optionalAuth, requireAuth, resolveActor } from "../middleware/auth.js";
import { send, sendCreated } from "../lib/respond.js";
import { Validator } from "../lib/validate.js";
import { ROLES } from "../lib/constants.js";
import {
  currentSession,
  linkWallet,
  logout,
  registerUser,
  requestOtp,
  verifyOtp,
  verifyPan,
} from "../services/auth.service.js";

export const authRouter = Router();

/** POST /api/auth/register - mobile registration (creates the account + OTP). */
authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const payload = {
      mobile: v.mobile("mobile"),
      name: v.string("name", { required: false, min: 2, max: 80 }),
      email: v.email("email"),
      role: v.oneOf("role", ROLES, { required: false, fallback: "investor" }),
    };
    v.done();

    const result = await registerUser(payload);
    return sendCreated(res, result);
  }),
);

/** POST /api/auth/otp - request a simulated OTP. */
authRouter.post(
  "/otp",
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const mobile = v.mobile("mobile");
    const role = v.oneOf("role", ROLES, { required: false, fallback: "investor" });
    v.done();

    const result = requestOtp({ mobile, role });
    return send(res, result, 202);
  }),
);

/** POST /api/auth/verify-otp - verify the OTP and open a session. */
authRouter.post(
  "/verify-otp",
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const requestId = v.string("requestId", { min: 4, max: 80 });
    const mobile = v.mobile("mobile");
    const otp = v.string("otp", {
      min: 6,
      max: 6,
      pattern: /^\d{6}$/,
      patternMessage: "Enter the 6-digit OTP sent to your mobile.",
    });
    const role = v.oneOf("role", ROLES, { required: false });
    v.done();

    const session = await verifyOtp({ requestId, mobile, otp, role });
    return send(res, session);
  }),
);

/** POST /api/auth/wallet - link an EVM wallet address. */
authRouter.post(
  "/wallet",
  optionalAuth,
  resolveActor,
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const address = v.wallet("address");
    v.done();

    const result = await linkWallet(address, req.auth?.user ?? null);
    return send(res, result);
  }),
);

/** POST /api/auth/pan - simulated PAN verification. */
authRouter.post(
  "/pan",
  optionalAuth,
  resolveActor,
  asyncHandler(async (req, res) => {
    const v = new Validator(req.body);
    const pan = v.pan("pan");
    v.done();

    const result = await verifyPan(pan, req.auth?.user ?? null);
    return send(res, result);
  }),
);

/** GET /api/auth/session - current session user. */
authRouter.get(
  "/session",
  requireAuth,
  asyncHandler(async (req, res) => {
    const header = req.get("authorization") ?? "";
    const token = header.split(/\s+/)[1];
    return send(res, currentSession(req.user, token));
  }),
);

/** POST /api/auth/logout - revoke the presented token. */
authRouter.post(
  "/logout",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const header = req.get("authorization") ?? "";
    return send(res, logout(header.split(/\s+/)[1]));
  }),
);

/** GET /api/auth/roles - role catalogue used by clients. */
authRouter.get("/roles", (req, res) =>
  send(res, {
    roles: ROLES,
    defaultRole: "investor",
    otp: { length: 6, expiresInSeconds: 300, devMode: true },
  }),
);
