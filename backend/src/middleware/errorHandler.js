import { config } from "../config.js";

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} does not exist.`,
    code: "ROUTE_NOT_FOUND",
    requestId: req.id,
  });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  let status = Number(error.status) || 500;
  let code = error.code ?? "INTERNAL_ERROR";
  let message = error.message ?? "Something went wrong.";
  let details = error.details;

  if (error.type === "entity.parse.failed") {
    status = 400;
    code = "INVALID_JSON";
    message = "Request body is not valid JSON.";
    details = undefined;
  } else if (error.type === "entity.too.large") {
    status = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request body is too large.";
    details = undefined;
  } else if (error.name === "TypeError" && status < 500) {
    status = 400;
  }

  if (status >= 500) {
    console.error(`[landchain] ${req.method} ${req.originalUrl} failed`, error);
  }

  const payload = {
    success: false,
    message:
      status >= 500 && config.env === "production"
        ? "An unexpected server error occurred. Please retry."
        : message,
    code,
    requestId: req.id,
  };
  if (details) payload.details = details;

  return res.status(status).json(payload);
}
