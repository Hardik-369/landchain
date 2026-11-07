import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { engineRouter } from "./routes/index.js";
import { store } from "./lib/store.js";

function requestContext(req, res, next) {
  req.id = req.get("x-request-id") ?? randomUUID();
  res.set("X-Request-Id", req.id);
  next();
}

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} does not exist.`,
    code: "ROUTE_NOT_FOUND",
    requestId: req.id,
  });
}

function errorHandler(error, req, res, next) {
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
  }

  if (status >= 500) {
    console.error(`[investment-engine] ${req.method} ${req.originalUrl} failed`, error);
    if (config.env === "production") message = "An unexpected server error occurred. Please retry.";
  }

  const payload = { success: false, message, code, requestId: req.id };
  if (details) payload.details = details;
  return res.status(status).json(payload);
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);

  const allowAll = config.corsOrigins.includes("*");
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowAll || config.corsOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-User-Id", "X-User-Role", "X-Request-Id"],
      exposedHeaders: ["X-Request-Id", "X-Total-Count", "Location"],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(requestContext);

  app.get("/health", (req, res) =>
    res.json({
      status: "ok",
      service: "landchain-investment-engine",
      dataDir: store.dataDir,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    }),
  );

  app.use("/api/engine", engineRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
