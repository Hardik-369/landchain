import { Router } from "express";
import { investorsRouter } from "./investors.routes.js";
import { investmentsRouter } from "./investments.routes.js";
import { propertiesRouter } from "./properties.routes.js";
import { resaleRouter } from "./resale.routes.js";
import { auditLedger } from "../services/audit.service.js";
import { defaultThresholds } from "../services/pooling.service.js";
import { ledgerStatus } from "../lib/ledger.js";
import { store } from "../lib/store.js";
import { config } from "../config.js";
import { asyncHandler, send } from "./helpers.js";

export const engineRouter = Router();

engineRouter.get("/", (req, res) =>
  send(res, {
    service: "LANDCHAIN investment engine",
    version: "1.0.0",
    storage: "JSON files shared with the backend (backend/data)",
    ledger: config.ledgerMode,
    endpoints: {
      health: "/api/engine/health",
      config: "/api/engine/config",
      audit: "/api/engine/audit",
      investors: "/api/engine/investors",
      investments: "/api/engine/investments",
      quote: "/api/engine/investments/quote",
      properties: "/api/engine/properties",
      ownership: "/api/engine/properties/:propertyId/ownership",
      resale: "/api/engine/resale",
      resaleStats: "/api/engine/resale/stats",
      resaleHistory: "/api/engine/resale/history",
    },
  }),
);

engineRouter.get(
  "/health",
  asyncHandler(async (req, res) =>
    send(res, {
      status: "ok",
      service: "landchain-investment-engine",
      version: "1.0.0",
      dataDir: store.dataDir,
      ledger: await ledgerStatus(),
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    }),
  ),
);

engineRouter.get("/config", (req, res) =>
  send(res, {
    currency: config.currency,
    tokenSymbol: config.tokenSymbol,
    ledgerMode: config.ledgerMode,
    reservationTtlSeconds: config.reservationTtlSeconds,
    thresholds: defaultThresholds(),
  }),
);

engineRouter.get(
  "/audit",
  asyncHandler(async (req, res) => {
    const report = await auditLedger();
    return send(res, report, report.ok ? 200 : 409);
  }),
);

engineRouter.use("/investors", investorsRouter);
engineRouter.use("/investments", investmentsRouter);
engineRouter.use("/properties", propertiesRouter);
engineRouter.use("/resale", resaleRouter);

engineRouter.use((req, res) =>
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} does not exist in the investment engine.`,
    code: "ROUTE_NOT_FOUND",
  }),
);
