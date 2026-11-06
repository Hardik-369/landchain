import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, "..");

// Load backend/.env when present (Node >=20.12 built-in loader).
try {
  process.loadEnvFile(path.join(backendRoot, ".env"));
} catch {
  // No .env file - environment variables (or defaults) are used.
}

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value, fallback) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function list(value, fallback) {
  const entries = String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return entries.length ? entries : fallback;
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: num(process.env.PORT, 5000),
  host: process.env.HOST ?? "0.0.0.0",
  backendRoot,
  dataDir: process.env.DATA_DIR ?? path.join(backendRoot, "data"),
  corsOrigins: list(process.env.CORS_ORIGIN, ["http://localhost:3000"]),
  authSecret: process.env.AUTH_SECRET ?? "landchain-dev-secret-change-me",
  sessionTtlSeconds: num(process.env.SESSION_TTL_SECONDS, 43_200),
  otp: {
    ttlSeconds: num(process.env.OTP_TTL_SECONDS, 300),
    maxAttempts: num(process.env.OTP_MAX_ATTEMPTS, 5),
    devMode: bool(process.env.OTP_DEV_MODE, true),
    demoCode: process.env.OTP_DEMO_CODE ?? "123456",
  },
  demoAllowAnonymous: bool(process.env.DEMO_ALLOW_ANONYMOUS, true),
  demoAdminBypass: bool(process.env.DEMO_ADMIN_BYPASS, true),
  backupRetention: num(process.env.BACKUP_RETENTION, 25),
  network: process.env.NETWORK_NAME ?? "Hedera Testnet",
};

if (config.env === "production" && config.authSecret === "landchain-dev-secret-change-me") {
  console.warn(
    "[landchain] AUTH_SECRET is still the development default. Set a strong secret in production.",
  );
}
