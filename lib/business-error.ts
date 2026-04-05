/**
 * Business Logic Error
 * Custom error class for business logic errors in transactions
 */

export class BusinessLogicError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number = 422
  ) {
    super(message);
    this.name = 'BusinessLogicError';
  }
}

/**
 * Check if error is a BusinessLogicError
 */
export function isBusinessLogicError(error: unknown): error is BusinessLogicError {
  return error instanceof BusinessLogicError;
}
