import { AppError } from "../../../backend/src/lib/errors.js";

export { AppError };

export function unprocessable(message, details) {
  return AppError.unprocessable(message, details);
}

export function conflict(message) {
  return AppError.conflict(message);
}

export function notFound(message) {
  return AppError.notFound(message);
}

export function unauthorized(message) {
  return AppError.unauthorized(message);
}

export function serviceUnavailable(message) {
  return AppError.serviceUnavailable(message);
}
