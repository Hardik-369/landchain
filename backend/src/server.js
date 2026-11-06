import { createApp } from "./app.js";
import { config } from "./config.js";
import { store } from "./lib/store.js";

async function main() {
  await store.init();
  const app = createApp();

  const server = app.listen(config.port, config.host, () => {
    console.log(
      `[landchain] backend listening on http://localhost:${config.port} (${config.env})`,
    );
    console.log(`[landchain] JSON data directory: ${store.dataDir}`);
    if (config.demoAllowAnonymous) {
      console.log(
        "[landchain] DEMO_ALLOW_ANONYMOUS is on - requests without a token act as a seeded demo user.",
      );
    }
  });

  server.on("error", (error) => {
    console.error("[landchain] server error", error);
    process.exitCode = 1;
  });

  const shutdown = (signal) => {
    console.log(`[landchain] ${signal} received, shutting down.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[landchain] failed to start", error);
  process.exit(1);
});
