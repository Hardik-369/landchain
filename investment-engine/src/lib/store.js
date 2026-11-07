/**
 * Storage adapter.
 *
 * The engine deliberately does not ship its own database. It instantiates
 * Contributor 2's `JsonStore` against the same `backend/data` directory, which
 * gives us:
 *
 *   - atomic writes + backups + the cross-process lock file
 *   - the append-only guards on transactions / ownershipHistory / tokenRecords
 *   - a single `transact()` that persists several collections together, so
 *     unit balances, funding progress and ownership history cannot drift
 *
 * Only the shared API is imported; no backend file is modified.
 */
import { JsonStore } from "../../../backend/src/lib/jsonStore.js";
import { COLLECTIONS } from "../../../backend/src/lib/collections.js";
import { config } from "../config.js";

export { COLLECTIONS };

export const store = new JsonStore({
  dataDir: config.dataDir,
  backupRetention: config.backupRetention,
});

let ready = null;

/** Create missing collection files and fail fast on corrupt JSON. */
export function initStore() {
  if (!ready) ready = store.init();
  return ready;
}

export const ENGINE_COLLECTIONS = Object.freeze([
  "investments",
  "investors",
  "resaleListings",
  "ownershipHistory",
  "transactions",
  "tokenRecords",
]);
