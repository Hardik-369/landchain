import { promises as fs } from "node:fs";
import path from "node:path";
import { COLLECTIONS } from "./collections.js";
import { AppError } from "./errors.js";

const LOCK_FILE = ".write.lock";
const LOCK_STALE_MS = 10_000;
const LOCK_TIMEOUT_MS = 8_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function emptyValue(name) {
  return COLLECTIONS[name].shape === "array" ? [] : {};
}

/**
 * Centralised JSON storage service.
 *
 * - every write is serialised through an in-process queue and an OS lock file
 * - files are replaced atomically (write temp + rename)
 * - the previous version is copied into data/.backups before each write
 * - append-only collections reject edits and deletions
 * - callers mutate a draft inside `transact` and the whole set is persisted
 *   together, so cross-collection invariants (e.g. units sold vs investment)
 *   never drift.
 */
export class JsonStore {
  #queue = Promise.resolve();

  constructor({ dataDir, backupRetention = 25 }) {
    this.dataDir = dataDir;
    this.backupDir = path.join(dataDir, ".backups");
    this.backupRetention = backupRetention;
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(this.backupDir, { recursive: true });

    for (const name of Object.keys(COLLECTIONS)) {
      const { file, shape } = COLLECTIONS[name];
      const target = path.join(this.dataDir, file);
      try {
        await fs.access(target);
      } catch {
        await this.#writeRaw(target, shape === "array" ? [] : {});
        continue;
      }
      // Fail fast on a corrupted file instead of silently overwriting data.
      await this.#load(name);
    }
    return this;
  }

  pathFor(name) {
    return path.join(this.dataDir, COLLECTIONS[name].file);
  }

  /** Read one collection as a deep copy. */
  async read(name) {
    this.#assertKnown(name);
    return structuredClone(await this.#load(name));
  }

  /** Read several collections at once (a consistent read after the queue drains). */
  async readMany(names) {
    const unique = [...new Set(names)];
    unique.forEach((name) => this.#assertKnown(name));
    return this.#enqueue(async () => {
      const out = {};
      for (const name of unique) out[name] = structuredClone(await this.#load(name));
      return out;
    });
  }

  /**
   * Apply a mutation to one or more collections.
   *
   * @param {string[]} names collections the mutator intends to touch
   * @param {(drafts: Record<string, any>) => any} mutator mutates drafts in place
   */
  async transact(names, mutator) {
    const unique = [...new Set(names)];
    unique.forEach((name) => this.#assertKnown(name));

    return this.#enqueue(async () => {
      const release = await this.#acquireLock();
      try {
        const drafts = {};
        const snapshot = {};
        for (const name of unique) {
          drafts[name] = await this.#load(name);
          snapshot[name] = structuredClone(drafts[name]);
        }

        const result = await mutator(drafts);

        for (const name of unique) {
          this.#assertShape(name, drafts[name]);
          this.#assertAppendOnly(name, snapshot[name], drafts[name]);
        }

        for (const name of unique) {
          if (JSON.stringify(drafts[name]) !== JSON.stringify(snapshot[name])) {
            await this.#persist(name, drafts[name]);
          }
        }
        return result;
      } finally {
        await release();
      }
    });
  }

  async listBackups() {
    const entries = await fs.readdir(this.backupDir).catch(() => []);
    return entries
      .filter((file) => file.endsWith(".json"))
      .sort()
      .reverse()
      .map((file) => ({ file, path: path.join(this.backupDir, file) }));
  }

  // ---------------------------------------------------------------- internals

  #assertKnown(name) {
    if (!COLLECTIONS[name]) {
      throw new AppError(`Unknown collection "${name}"`, 500, "STORE_UNKNOWN_COLLECTION");
    }
  }

  #assertShape(name, value) {
    const { shape } = COLLECTIONS[name];
    if (shape === "array" && !Array.isArray(value)) {
      throw new AppError(
        `Collection "${name}" must be an array.`,
        500,
        "STORE_SHAPE_ERROR",
      );
    }
    if (shape === "object" && (Array.isArray(value) || typeof value !== "object" || value === null)) {
      throw new AppError(
        `Collection "${name}" must be an object.`,
        500,
        "STORE_SHAPE_ERROR",
      );
    }
  }

  /** Append-only collections may grow, never shrink or change existing rows. */
  #assertAppendOnly(name, before, after) {
    if (!COLLECTIONS[name].appendOnly) return;
    if (after.length < before.length) {
      throw new AppError(
        `Collection "${name}" is append-only; records cannot be removed.`,
        409,
        "APPEND_ONLY_VIOLATION",
      );
    }
    const current = new Map(after.map((record) => [record.id, JSON.stringify(record)]));
    for (const record of before) {
      const serialised = current.get(record.id);
      if (serialised === undefined) {
        throw new AppError(
          `Collection "${name}" is append-only; ${record.id} cannot be removed.`,
          409,
          "APPEND_ONLY_VIOLATION",
        );
      }
      if (serialised !== JSON.stringify(record)) {
        throw new AppError(
          `Collection "${name}" is append-only; ${record.id} cannot be modified.`,
          409,
          "APPEND_ONLY_VIOLATION",
        );
      }
    }
  }

  #enqueue(task) {
    const run = this.#queue.then(task, task);
    this.#queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async #load(name) {
    const file = this.pathFor(name);
    let raw;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return emptyValue(name);
      throw error;
    }
    if (raw.trim() === "") return emptyValue(name);
    try {
      const parsed = JSON.parse(raw);
      this.#assertShape(name, parsed);
      return parsed;
    } catch (error) {
      throw new AppError(
        `Stored JSON for "${name}" is invalid: ${error.message}`,
        500,
        "STORE_CORRUPT",
      );
    }
  }

  async #persist(name, value) {
    const target = this.pathFor(name);
    await fs.mkdir(this.backupDir, { recursive: true });

    try {
      await fs.access(target);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await fs.copyFile(target, path.join(this.backupDir, `${name}.${stamp}.json`));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    await this.#writeRaw(target, value);
    await this.#pruneBackups(name);
  }

  async #writeRaw(target, value) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await fs.rename(temp, target);
  }

  async #pruneBackups(name) {
    const entries = (await fs.readdir(this.backupDir).catch(() => []))
      .filter((file) => file.startsWith(`${name}.`) && file.endsWith(".json"))
      .sort()
      .reverse();
    for (const stale of entries.slice(this.backupRetention)) {
      await fs.unlink(path.join(this.backupDir, stale)).catch(() => {});
    }
  }

  async #acquireLock() {
    const lockPath = path.join(this.dataDir, LOCK_FILE);
    const startedAt = Date.now();

    for (;;) {
      try {
        const handle = await fs.open(lockPath, "wx");
        await handle.writeFile(
          JSON.stringify({ pid: process.pid, at: new Date().toISOString() }),
          "utf8",
        );
        await handle.close();
        return async () => {
          await fs.unlink(lockPath).catch(() => {});
        };
      } catch (error) {
        if (error.code !== "EEXIST") throw error;

        try {
          const stats = await fs.stat(lockPath);
          if (Date.now() - stats.mtimeMs > LOCK_STALE_MS) {
            await fs.unlink(lockPath).catch(() => {});
            continue;
          }
        } catch {
          continue;
        }

        if (Date.now() - startedAt > LOCK_TIMEOUT_MS) {
          throw new AppError(
            "The data store is busy with another write. Please retry.",
            503,
            "STORE_BUSY",
          );
        }
        await sleep(25 + Math.floor(Math.random() * 25));
      }
    }
  }
}
