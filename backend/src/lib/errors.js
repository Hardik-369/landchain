/** Application error carrying an HTTP status and a stable machine code. */
export class AppError extends Error {
  constructor(message, status = 500, code = "INTERNAL_ERROR", details = undefined) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new AppError(message, 400, "BAD_REQUEST", details);
  }

  static unauthorized(message = "Authentication is required.") {
    return new AppError(message, 401, "UNAUTHORIZED");
  }

  static forbidden(message = "You do not have permission to perform this action.") {
    return new AppError(message, 403, "FORBIDDEN");
  }

  static notFound(message = "Resource not found.") {
    return new AppError(message, 404, "NOT_FOUND");
  }

  static conflict(message) {
    return new AppError(message, 409, "CONFLICT");
  }

  static unprocessable(message, details) {
    return new AppError(message, 422, "VALIDATION_ERROR", details);
  }

  static tooManyRequests(message = "Too many requests. Try again later.") {
    return new AppError(message, 429, "RATE_LIMITED");
  }

  static serviceUnavailable(message = "Service temporarily unavailable.") {
    return new AppError(message, 503, "SERVICE_UNAVAILABLE");
  }
}

export function assert(condition, error) {
  if (!condition) throw error;
}
