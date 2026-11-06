import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { requestContext } from "./middleware/requestContext.js";
import { optionalAuth, resolveActor } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/index.js";
import { store } from "./lib/store.js";

const EXPOSED_HEADERS = [
  "X-Request-Id",
  "X-Total-Count",
  "X-Page",
  "X-Page-Size",
  "X-Total-Pages",
  "X-Actor-Mode",
  "X-Demo-Override",
];

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);

  const allowAllOrigins = config.corsOrigins.includes("*");
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowAllOrigins || config.corsOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Demo-Role"],
      exposedHeaders: EXPOSED_HEADERS,
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(requestContext);

  app.get("/health", (req, res) =>
    res.json({
      status: "ok",
      service: "landchain-backend",
      version: "1.0.0",
      storage: "json",
      dataDir: store.dataDir,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    }),
  );

  // Authentication is resolved once for the whole API surface.
  app.use("/api", optionalAuth, resolveActor, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export { config };
