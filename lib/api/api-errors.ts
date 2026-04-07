/**
 * Error Codes
 * Standard error codes for API responses (SCREAMING_SNAKE_CASE)
 */

export const ErrorCodes = {
  // 400 - Bad Request
  INVALID_JSON: 'INVALID_JSON',
  INVALID_REQUEST_FORMAT: 'INVALID_REQUEST_FORMAT',

  // 401 - Unauthorized
  UNAUTHORIZED: 'UNAUTHORIZED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',

  // 403 - Forbidden
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  SYSTEM_ACCOUNT_PROTECTED: 'SYSTEM_ACCOUNT_PROTECTED',

  // 404 - Not Found
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',

  // 409 - Conflict
  RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',

  // 422 - Unprocessable Entity
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  REQUIRED_FIELD: 'REQUIRED_FIELD',
  INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',
  RELATED_RESOURCE_NOT_FOUND: 'RELATED_RESOURCE_NOT_FOUND',
  RELATION_VIOLATION: 'RELATION_VIOLATION',
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',

  // Accounting-specific (422)
  IMBALANCED_ENTRY: 'IMBALANCED_ENTRY',
  CLOSED_PERIOD: 'CLOSED_PERIOD',
  INVALID_ACCOUNT_TYPE: 'INVALID_ACCOUNT_TYPE',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  TYPE_CHANGE_NOT_ALLOWED: 'TYPE_CHANGE_NOT_ALLOWED',

  // 429 - Too Many Requests
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // 500 - Internal Server Error
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Business Logic Error
 * Custom error class for business logic errors in transactions
 */

export class BusinessLogicError extends Error {
	constructor(
		message: string,
		public code: string,
		public status: number = 422,
	) {
		super(message);
		this.name = "BusinessLogicError";
	}
}

/**
 * Check if error is a BusinessLogicError
 */
export function isBusinessLogicError(error: unknown): error is BusinessLogicError {
	return error instanceof BusinessLogicError;
}
