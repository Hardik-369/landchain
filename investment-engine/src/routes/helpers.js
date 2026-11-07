import { AppError } from "../lib/errors.js";

export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

/**
 * The engine runs beside Contributor 2's authenticated API, so the acting
 * investor is passed in (header or body) rather than re-implementing auth here.
 */
export function actorFrom(req) {
  const id =
    req.get("x-user-id") ??
    req.body?.userId ??
    req.body?.actorId ??
    req.query.actorId ??
    null;
  if (!id) return null;
  return {
    id: String(id),
    role: req.get("x-user-role") ?? req.body?.role ?? "investor",
  };
}

export function requireActor(req, message = "Sign in to continue.") {
  const actor = actorFrom(req);
  if (!actor) throw AppError.unauthorized(message);
  return actor;
}

export function send(res, data, status = 200) {
  return res.status(status).json(data);
}

export function sendCreated(res, data, location) {
  if (location) res.set("Location", location);
  return res.status(201).json(data);
}
