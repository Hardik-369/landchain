import { config } from "../config.js";
import { AppError } from "../lib/errors.js";
import { store } from "../lib/store.js";
import { verifyToken } from "../lib/token.js";
import { ROLES } from "../lib/constants.js";
import { asyncHandler } from "./asyncHandler.js";

/**
 * Reads `Authorization: Bearer <token>` when present. A malformed or expired
 * token is a hard 401 - it never silently degrades to the demo actor.
 */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  const header = req.get("authorization");
  if (!header) {
    req.auth = null;
    return next();
  }

  const [scheme, token] = header.split(/\s+/);
  if (!/^Bearer$/i.test(scheme ?? "") || !token) {
    throw AppError.unauthorized('Use the "Authorization: Bearer <token>" header.');
  }

  const payload = verifyToken(token);
  const users = await store.read("users");
  const user = users.find((candidate) => candidate.id === payload.sub);
  if (!user) throw AppError.unauthorized("The user for this session no longer exists.");
  if (user.status === "suspended") throw AppError.forbidden("This account is suspended.");

  req.auth = { user, token, payload };
  return next();
});

/**
 * Resolves the acting user. When DEMO_ALLOW_ANONYMOUS is on, requests without a
 * token act as a seeded demo user (optionally chosen with ?role=/?actorRole=) so
 * the frontend, which does not attach a token, remains fully functional.
 * Disable it to force real authentication.
 */
export const resolveActor = asyncHandler(async (req, res, next) => {
  if (req.auth?.user) {
    req.user = req.auth.user;
    req.isDemoActor = false;
    return next();
  }

  if (!config.demoAllowAnonymous) {
    return next();
  }

  const users = await store.read("users");
  if (!users.length) return next();

  const requestedRole = String(req.query.role ?? req.query.actorRole ?? req.body?.role ?? "")
    .trim()
    .toLowerCase();
  const wanted = ROLES.includes(requestedRole)
    ? requestedRole
    : String(req.get("x-demo-role") ?? "").toLowerCase();
  const demoUser =
    users.find((user) => ROLES.includes(wanted) && user.role === wanted) ??
    users.find((user) => user.role === "investor") ??
    users[0];

  req.user = demoUser;
  req.isDemoActor = true;
  res.set("X-Actor-Mode", "demo");
  return next();
});

export function requireAuth(req, res, next) {
  if (!req.auth?.user) {
    return next(AppError.unauthorized("Sign in to continue."));
  }
  req.user = req.auth.user;
  return next();
}

/**
 * Role guard. In demo mode an anonymous actor may pass admin-only guards when
 * DEMO_ADMIN_BYPASS is on (the frontend has no login token yet). Turn that off
 * for real deployments.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    const user = req.user ?? req.auth?.user;
    if (!user) return next(AppError.unauthorized("Sign in to continue."));
    if (roles.includes(user.role)) return next();

    if (req.isDemoActor && config.demoAdminBypass && roles.includes("admin")) {
      res.set("X-Demo-Override", "admin-role-bypassed");
      return next();
    }

    return next(
      AppError.forbidden(
        `This action requires one of these roles: ${roles.join(", ")}. Your role is ${user.role}.`,
      ),
    );
  };
}

export function requireSelfOrAdmin(paramName = "id") {
  return (req, res, next) => {
    const user = req.user ?? req.auth?.user;
    if (!user) return next(AppError.unauthorized("Sign in to continue."));
    const targetId = req.params[paramName] ?? req.body?.userId;
    if (user.id === targetId || user.role === "admin") return next();

    if (req.isDemoActor && config.demoAdminBypass) {
      res.set("X-Demo-Override", "self-check-bypassed");
      return next();
    }
    return next(AppError.forbidden("You may only access your own account."));
  };
}
