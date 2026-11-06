/**
 * Response convention
 * -------------------
 * Success: the resource itself (object) or an array for collections. This keeps
 * the payloads directly compatible with the frontend service layer, which casts
 * the parsed body to its model types.
 * Errors: { success: false, message, code, details?, requestId }.
 */
export function send(res, data, status = 200) {
  return res.status(status).json(data);
}

export function sendCreated(res, data, location) {
  if (location) res.set("Location", location);
  return res.status(201).json(data);
}

/** List response with pagination metadata in headers (body stays a bare array). */
export function sendList(res, items, { page, limit, total }) {
  res.set("X-Total-Count", String(total));
  res.set("X-Page", String(page));
  res.set("X-Page-Size", String(limit));
  res.set("X-Total-Pages", String(Math.max(1, Math.ceil(total / limit))));
  return res.status(200).json(items);
}

export function sendNoContent(res) {
  return res.status(204).end();
}
