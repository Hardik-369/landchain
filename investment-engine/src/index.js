/**
 * LANDCHAIN investment engine - public API.
 *
 * Standalone service:
 *   import { createApp } from "./investment-engine/src/app.js";
 *
 * Embedded in another Express app:
 *   import { engineRouter } from "./investment-engine/src/routes/index.js";
 *   app.use("/api/engine", engineRouter);
 */
export { createApp } from "./app.js";
export { engineRouter } from "./routes/index.js";
export { config } from "./config.js";
export { initStore, store } from "./lib/store.js";

export {
  DEFAULT_INVESTMENT_RULES,
  resolveRules,
  thresholdsFor,
  ownershipPercent,
} from "./thresholds.js";

export { registerInvestor, investorHistory, listInvestors } from "./services/investor.service.js";
export {
  createInvestment,
  quoteInvestment,
  listInvestments,
  getInvestment,
  evaluateInvestment,
} from "./services/investment.service.js";
export {
  propertyOwnership,
  investorHoldings,
  ownershipHistory,
} from "./services/ownership.service.js";
export {
  createListing,
  listListings,
  getListing,
  reserveListing,
  releaseReservation,
  cancelListing,
  buyListing,
  resaleHistory,
  resaleStats,
} from "./services/resale.service.js";
export { listPooledProperties, propertyFunding } from "./services/pooling.service.js";
export { auditLedger } from "./services/audit.service.js";
