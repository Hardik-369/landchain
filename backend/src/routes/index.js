import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { usersRouter } from "./users.routes.js";
import { propertiesRouter } from "./properties.routes.js";
import { documentsRouter } from "./documents.routes.js";
import { verificationRouter } from "./verification.routes.js";
import { investmentsRouter } from "./investments.routes.js";
import { transactionsRouter } from "./transactions.routes.js";
import { propertyHistoryRouter } from "./propertyHistory.routes.js";
import { resaleRouter } from "./resale.routes.js";
import { adminRouter } from "./admin.routes.js";
import { registryRouter } from "./registry.routes.js";
import { sellerRouter } from "./seller.routes.js";
import { store } from "../lib/store.js";
import { COLLECTIONS } from "../lib/collections.js";
import { send } from "../lib/respond.js";

export const apiRouter = Router();

apiRouter.get("/", (req, res) =>
  send(res, {
    service: "LANDCHAIN API",
    version: "1.0.0",
    storage: "JSON files",
    endpoints: {
      auth: "/api/auth",
      users: "/api/users",
      properties: "/api/properties",
      documents: "/api/documents",
      verification: "/api/verification",
      investments: "/api/investments",
      transactions: "/api/transactions",
      propertyHistory: "/api/property-history",
      resale: "/api/resale",
      admin: "/api/admin",
      registry: "/api/registry",
      seller: "/api/seller",
      health: "/health",
    },
  }),
);

apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/properties", propertiesRouter);
apiRouter.use("/documents", documentsRouter);
apiRouter.use("/verification", verificationRouter);
apiRouter.use("/investments", investmentsRouter);
apiRouter.use("/transactions", transactionsRouter);
apiRouter.use("/property-history", propertyHistoryRouter);
apiRouter.use("/resale", resaleRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/registry", registryRouter);
apiRouter.use("/seller", sellerRouter);

/** Readiness probe: reports collections and record counts. */
apiRouter.get("/health/storage", async (req, res) => {
  const data = await store.readMany(Object.keys(COLLECTIONS));
  const summary = Object.fromEntries(
    Object.entries(data).map(([name, value]) => [
      name,
      Array.isArray(value) ? value.length : Object.keys(value).length,
    ]),
  );
  return send(res, {
    status: "ok",
    dataDir: store.dataDir,
    collections: summary,
    appendOnly: Object.entries(COLLECTIONS)
      .filter(([, definition]) => definition.appendOnly)
      .map(([name]) => name),
  });
});
