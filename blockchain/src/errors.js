/**
 * Typed errors for the blockchain module.
 *
 * `status` maps onto HTTP status codes so the Express adapter (and Contributor
 * 2's API) can return meaningful responses without inspecting message strings.
 */
class BlockchainError extends Error {
  constructor(message, { code = "BLOCKCHAIN_ERROR", status = 500, cause, details } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

class ValidationError extends BlockchainError {
  constructor(message, options = {}) {
    super(message, { code: "VALIDATION_ERROR", status: 422, ...options });
  }
}

class NotFoundError extends BlockchainError {
  constructor(message, options = {}) {
    super(message, { code: "NOT_FOUND", status: 404, ...options });
  }
}

class ConfigurationError extends BlockchainError {
  constructor(message, options = {}) {
    super(message, { code: "CONFIGURATION_ERROR", status: 500, ...options });
  }
}

class NetworkError extends BlockchainError {
  constructor(message, options = {}) {
    super(message, { code: "NETWORK_ERROR", status: 502, ...options });
  }
}

class TransactionError extends BlockchainError {
  constructor(message, options = {}) {
    super(message, { code: "TRANSACTION_FAILED", status: 409, ...options });
  }
}

module.exports = {
  BlockchainError,
  ValidationError,
  NotFoundError,
  ConfigurationError,
  NetworkError,
  TransactionError,
};
