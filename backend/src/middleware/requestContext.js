import { randomUUID } from "node:crypto";

/** Attach a request id and log a single line per request when it completes. */
export function requestContext(req, res, next) {
  req.id = randomUUID();
  res.set("X-Request-Id", req.id);
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(
      `[landchain] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${durationMs.toFixed(1)}ms ${req.id}`,
    );
  });

  next();
}
