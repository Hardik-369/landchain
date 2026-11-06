#!/usr/bin/env node
/**
 * Write a fresh demo dataset into backend/data.
 *
 *   node scripts/seed.mjs          # seeds only when the store is empty
 *   node scripts/seed.mjs --force  # overwrite existing JSON files
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../src/config.js";
import { COLLECTIONS } from "../src/lib/collections.js";
import { buildSeedData } from "../seed/demoData.js";

const force = process.argv.includes("--force");

async function recordCount(file) {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
  } catch {
    return 0;
  }
}

async function main() {
  await fs.mkdir(config.dataDir, { recursive: true });

  const existing = await Promise.all(
    Object.values(COLLECTIONS).map((definition) =>
      recordCount(path.join(config.dataDir, definition.file)),
    ),
  );
  const total = existing.reduce((sum, count) => sum + count, 0);

  if (total > 0 && !force) {
    console.log(
      `[seed] ${total} record(s) already exist in ${config.dataDir}. Re-run with --force to overwrite.`,
    );
    return;
  }

  const data = buildSeedData();

  for (const [name, definition] of Object.entries(COLLECTIONS)) {
    const target = path.join(config.dataDir, definition.file);
    const value = data[name];
    if (value === undefined) {
      throw new Error(`Seed data is missing the "${name}" collection.`);
    }
    await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    const size = Array.isArray(value)
      ? `${value.length} record(s)`
      : `${Object.keys(value).length} key(s)`;
    console.log(`[seed] ${definition.file.padEnd(24)} ${size}`);
  }

  console.log(`[seed] done - data written to ${config.dataDir}`);
}

main().catch((error) => {
  console.error("[seed] failed", error);
  process.exit(1);
});
