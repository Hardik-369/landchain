import { createApp } from "./app.js";
import { config } from "./config.js";
import { initStore } from "./lib/store.js";
import { ledgerStatus } from "./lib/ledger.js";

async function main() {
  await initStore();
  const app = createApp();

  const server = app.listen(config.port, config.host, async () => {
    const ledger = await ledgerStatus().catch((error) => ({ mode: "error", reason: error.message }));
    console.log(
      [
        "",
        "  LANDCHAIN investment engine",
        `  API      http://localhost:${config.port}/api/engine`,
        `  Health   http://localhost:${config.port}/api/engine/health`,
        `  Storage  ${config.dataDir}`,
        `  Ledger   ${ledger.mode}${ledger.reason ? ` (${ledger.reason})` : ""}`,
        "",
      ].join("\n"),
    );
  });

  const shutdown = (signal) => {
    console.log(`\n[investment-engine] ${signal} received, shutting down.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[investment-engine] failed to start", error);
  process.exit(1);
});
