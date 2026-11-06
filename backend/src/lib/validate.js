import { AppError } from "./errors.js";

const MOBILE_PATTERN = /^[6-9]\d{9}$/;
const PAN_PATTERN = /^[A-Z]{5}\d{4}[A-Z]$/;
const WALLET_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Normalise any Indian mobile input to 10 digits. */
export function normalizeMobile(input) {
  const digits = String(input ?? "").replace(/\D/g, "");
  const ten = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.slice(-10);
  return MOBILE_PATTERN.test(ten) ? ten : "";
}

export function isMobile(value) {
  return MOBILE_PATTERN.test(normalizeMobile(value));
}

export function isPan(value) {
  return PAN_PATTERN.test(String(value ?? "").trim().toUpperCase());
}

export function isWallet(value) {
  return WALLET_PATTERN.test(String(value ?? "").trim());
}

export function isEmail(value) {
  return EMAIL_PATTERN.test(String(value ?? "").trim());
}

export function maskPan(pan) {
  const clean = String(pan ?? "").trim().toUpperCase();
  return `${clean.slice(0, 5)}****${clean.slice(9)}`;
}

export function maskMobile(mobile) {
  const ten = normalizeMobile(mobile);
  return ten ? `+91 ${ten.slice(0, 5)} ${ten.slice(5)}` : "";
}

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Small declarative validator. Collects every problem so clients get a
 * complete `details` list in one 422 response.
 */
export class Validator {
  constructor(input) {
    this.input = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    this.errors = [];
  }

  #fail(field, message) {
    this.errors.push({ field, message });
    return undefined;
  }

  has(field) {
    return Object.prototype.hasOwnProperty.call(this.input, field);
  }

  string(field, { required = true, min = 1, max = 5000, trim = true, pattern, patternMessage } = {}) {
    const raw = this.input[field];
    if (raw === undefined || raw === null || raw === "") {
      if (!required) return undefined;
      return this.#fail(field, `${label(field)} is required.`);
    }
    if (typeof raw !== "string") return this.#fail(field, `${label(field)} must be a string.`);
    const value = trim ? raw.trim() : raw;
    if (value.length < min) return this.#fail(field, `${label(field)} must be at least ${min} characters.`);
    if (value.length > max) return this.#fail(field, `${label(field)} must be at most ${max} characters.`);
    if (pattern && !pattern.test(value)) {
      return this.#fail(field, patternMessage ?? `${label(field)} is not valid.`);
    }
    return value;
  }

  number(field, { required = true, min = -Infinity, max = Infinity, integer = false } = {}) {
    const raw = this.input[field];
    if (raw === undefined || raw === null || raw === "") {
      if (!required) return undefined;
      return this.#fail(field, `${label(field)} is required.`);
    }
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(value)) return this.#fail(field, `${label(field)} must be a number.`);
    if (integer && !Number.isInteger(value)) return this.#fail(field, `${label(field)} must be a whole number.`);
    if (value < min) return this.#fail(field, `${label(field)} must be at least ${min}.`);
    if (value > max) return this.#fail(field, `${label(field)} must be at most ${max}.`);
    return value;
  }

  boolean(field, { required = false, fallback } = {}) {
    const raw = this.input[field];
    if (raw === undefined || raw === null || raw === "") {
      if (required && fallback === undefined) {
        return this.#fail(field, `${label(field)} is required.`);
      }
      return fallback;
    }
    if (typeof raw === "boolean") return raw;
    if (["true", "1", "yes"].includes(String(raw).toLowerCase())) return true;
    if (["false", "0", "no"].includes(String(raw).toLowerCase())) return false;
    return this.#fail(field, `${label(field)} must be true or false.`);
  }

  oneOf(field, allowed, { required = true, fallback } = {}) {
    const raw = this.input[field];
    if (raw === undefined || raw === null || raw === "") {
      if (!required) return fallback;
      return this.#fail(field, `${label(field)} is required.`);
    }
    const value = String(raw).trim().toLowerCase();
    if (!allowed.includes(value)) {
      return this.#fail(field, `${label(field)} must be one of: ${allowed.join(", ")}.`);
    }
    return value;
  }

  array(field, { required = true, min = 0, max = 50 } = {}) {
    const raw = this.input[field];
    if (raw === undefined || raw === null) {
      if (!required) return [];
      return this.#fail(field, `${label(field)} is required.`);
    }
    if (!Array.isArray(raw)) return this.#fail(field, `${label(field)} must be an array.`);
    if (raw.length < min) return this.#fail(field, `${label(field)} must contain at least ${min} item(s).`);
    if (raw.length > max) return this.#fail(field, `${label(field)} must contain at most ${max} item(s).`);
    return raw;
  }

  email(field, { required = false } = {}) {
    const value = this.string(field, { required, max: 160 });
    if (value === undefined) return undefined;
    if (!isEmail(value)) return this.#fail(field, "Enter a valid email address.");
    return value.toLowerCase();
  }

  mobile(field, { required = true } = {}) {
    const raw = this.input[field];
    if (raw === undefined || raw === null || raw === "") {
      if (!required) return undefined;
      return this.#fail(field, `${label(field)} is required.`);
    }
    const normalized = normalizeMobile(raw);
    if (!normalized) return this.#fail(field, "Enter a valid 10-digit Indian mobile number.");
    return normalized;
  }

  pan(field, { required = true } = {}) {
    const raw = this.input[field];
    if (raw === undefined || raw === null || raw === "") {
      if (!required) return undefined;
      return this.#fail(field, `${label(field)} is required.`);
    }
    const clean = String(raw).trim().toUpperCase();
    if (!isPan(clean)) return this.#fail(field, "PAN must look like ABCDE1234F.");
    return clean;
  }

  wallet(field, { required = true } = {}) {
    const raw = this.input[field];
    if (raw === undefined || raw === null || raw === "") {
      if (required) return this.#fail(field, "Wallet address is required.");
      return undefined;
    }
    const clean = String(raw).trim();
    if (!isWallet(clean)) {
      return this.#fail(field, "Enter a valid EVM wallet address (0x + 40 hex characters).");
    }
    return clean;
  }

  /** Throws a single 422 carrying every collected problem. */
  done() {
    if (this.errors.length) {
      throw AppError.unprocessable(
        this.errors[0].message,
        this.errors,
      );
    }
    return this.input;
  }
}

function label(field) {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

/**
 * Validate a fictional document upload list.
 * Each item is normalised to { name, type, size, content? }.
 */
export function documentList(input, field = "documents", { required = false, min = 0, max = 10 } = {}) {
  const raw = input?.[field];
  if (raw === undefined || raw === null) {
    if (required) throw AppError.unprocessable("Upload at least one ownership document.");
    return [];
  }
  if (!Array.isArray(raw)) throw AppError.unprocessable("Documents must be an array.");
  if (raw.length < min) {
    throw AppError.unprocessable(`Upload at least ${min} document(s).`);
  }
  if (raw.length > max) {
    throw AppError.unprocessable(`Upload at most ${max} documents at a time.`);
  }

  return raw.map((document, index) => {
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      throw AppError.unprocessable(`documents[${index}] must be an object.`);
    }
    const name = String(document.name ?? "").trim();
    if (!name) throw AppError.unprocessable(`documents[${index}].name is required.`);
    if (name.length > 120) {
      throw AppError.unprocessable(`documents[${index}].name is too long.`);
    }
    return {
      name,
      type: String(document.type ?? "PDF").trim().toUpperCase().slice(0, 20) || "PDF",
      size: String(document.size ?? "1.0 MB").trim().slice(0, 20),
      content: typeof document.content === "string" ? document.content : undefined,
    };
  });
}

export function parsePagination(query = {}, { defaultLimit = 50, maxLimit = 200 } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}
