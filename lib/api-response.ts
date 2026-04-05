/**
 * API Response Helpers
 * Standard response functions for consistent API responses
 */

import { NextResponse } from 'next/server';
import { ApiSuccessResponse, ApiErrorResponse } from './api-types';
import { ErrorCodes } from './error-codes';

/**
 * Create a success response
 */
export function success<T>(
  data: T,
  options?: {
    message?: string;
    status?: number;
    meta?: ApiSuccessResponse<T>['meta'];
  }
): NextResponse<ApiSuccessResponse<T>> {
  const { message = 'Success', status = 200, meta } = options || {};
  return NextResponse.json(
    {
      success: true,
      data,
      message,
      ...(meta && { meta }),
    },
    { status }
  );
}

/**
 * Create an error response
 */
export function error(
  message: string,
  code: string,
  options?: {
    status?: number;
    details?: Array<{ field?: string; message: string; code?: string }>;
    headers?: Record<string, string>;
  }
): NextResponse<ApiErrorResponse> {
  const { status = 400, details, headers } = options || {};
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details && { details }),
      },
    },
    { status, headers }
  );
}

/**
 * Pre-defined error responses
 */
export const errors = {
  /**
   * Validation error (422)
   */
  validation: (details: Array<{ field?: string; message: string }>) =>
    error('Validation failed', ErrorCodes.VALIDATION_ERROR, { status: 422, details }),

  /**
   * Unauthorized error (401)
   */
  unauthorized: (message = 'Unauthorized') =>
    error(message, ErrorCodes.UNAUTHORIZED, { status: 401 }),

  /**
   * Forbidden error (403)
   */
  forbidden: (message = 'Forbidden') =>
    error(message, ErrorCodes.FORBIDDEN, { status: 403 }),

  /**
   * Not found error (404)
   */
  notFound: (resource = 'Resource') =>
    error(`${resource} not found`, ErrorCodes.NOT_FOUND, { status: 404 }),

  /**
   * Conflict error (409) - for duplicates
   */
  conflict: (message = 'Resource already exists') =>
    error(message, ErrorCodes.RESOURCE_ALREADY_EXISTS, { status: 409 }),

  /**
   * Rate limit error (429)
   */
  rateLimit: (message?: string, headers?: Record<string, string>) =>
    error(message || 'Rate limit exceeded', ErrorCodes.RATE_LIMIT_EXCEEDED, { status: 429, headers }),

  /**
   * Internal server error (500)
   */
  internal: (message = 'Internal server error') =>
    error(message, ErrorCodes.INTERNAL_ERROR, { status: 500 }),

  /**
   * Bad request error (400)
   */
  badRequest: (message = 'Bad request') =>
    error(message, ErrorCodes.INVALID_REQUEST_FORMAT, { status: 400 }),
};

/**
 * Create a 204 No Content response (for DELETE operations)
 */
export function noContent(): NextResponse<null> {
  return new NextResponse(null, { status: 204 });
}
