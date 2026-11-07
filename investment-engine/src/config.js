import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const engineRoot = path.resolve(here, "..");
const repoRoot = path.resolve(engineRoot, "..");

// Optional investment-engine/.env (never committed). Contributor 2's backend
// keeps its own .env; this module only reads its own file plus env vars.
try {
  process.loadEnvFile(path.join(engineRoot, ".env"));
} catch {
  // No .env file - defaults below are used.
}

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value, fallback) {
  const entries = String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.length ? entries : fallback;
}

/**
 * The engine writes into Contributor 2's JSON store. `dataDir` therefore
 * defaults to backend/data so investments.json, investors.json,
 * resaleListings.json, ownershipHistory.json, transactions.json and
 * tokenRecords.json are the single source of truth - no second database.
 */
export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: num(process.env.PORT, 5100),
  host: process.env.HOST ?? "0.0.0.0",
  engineRoot,
  repoRoot,
  dataDir: process.env.DATA_DIR ?? path.join(repoRoot, "backend", "data"),
  corsOrigins: list(process.env.CORS_ORIGIN, ["http://localhost:3000", "http://localhost:5100"]),
  tokenSymbol: process.env.TOKEN_SYMBOL ?? "LANDT",
  currency: "INR",
  backupRetention: num(process.env.BACKUP_RETENTION, 25),

  // "auto"  -> use Hedera when credentials + contracts are configured, otherwise
  //            run unanchored and say so.
  // "live"  -> require Hedera; fail loudly when it is not configured.
  // "local" -> never call the blockchain module.
  ledgerMode: String(process.env.ENGINE_LEDGER_MODE ?? "auto").toLowerCase(),
  ledgerTransferOnResale: String(process.env.ENGINE_LEDGER_TRANSFER_ON_RESALE ?? "false") === "true",
  ledgerSignerKey: process.env.ENGINE_LEDGER_SIGNER_KEY ?? "",

  reservationTtlSeconds: num(process.env.RESALE_RESERVATION_TTL_SECONDS, 900),
};

if (!["auto", "live", "local"].includes(config.ledgerMode)) {
  throw new Error(`ENGINE_LEDGER_MODE must be auto, live or local (received "${config.ledgerMode}").`);
}
