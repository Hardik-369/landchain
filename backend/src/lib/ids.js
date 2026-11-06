import { randomBytes, randomUUID } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function suffix(length = 4) {
  const bytes = randomBytes(length);
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += ALPHABET[bytes[index] % ALPHABET.length];
  }
  return out;
}

/** Unique, sortable id: PREFIX-YYMMDD-XXXX. */
export function makeId(prefix) {
  const now = new Date();
  const stamp = [
    String(now.getUTCFullYear()).slice(2),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("");
  return `${prefix}-${stamp}-${suffix()}`;
}

export function makeUuid() {
  return randomUUID();
}

/** Next sequence for ids shaped like PREFIX-YYYY-001 (used for property ids). */
export function nextPropertyId(properties, year = new Date().getUTCFullYear()) {
  const pattern = new RegExp(`^LAND-${year}-(\\d+)$`);
  let max = 0;
  for (const property of properties) {
    const match = pattern.exec(String(property.id ?? ""));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `LAND-${year}-${String(max + 1).padStart(3, "0")}`;
}

/** Append-only friendly guard: throws when an id is already present. */
export function assertUniqueId(records, id, label = "record") {
  if (records.some((record) => record.id === id)) {
    throw new Error(`Duplicate ${label} id: ${id}`);
  }
}

export function randomOtp(digits = 6) {
  let code = "";
  const bytes = randomBytes(digits);
  for (let index = 0; index < digits; index += 1) {
    code += String(bytes[index] % 10);
  }
  return code;
}
