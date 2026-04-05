import { z, ZodError } from 'zod';
import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from './with-auth';
import { ErrorCodes } from './error-codes';

/**
 * Validation utility for API routes
 * Provides type-safe request validation using Zod schemas
 * Updated for standard API response format
 */

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validates request body against a Zod schema
 * Returns validation errors if invalid, null if valid
 */
export function validateBody<T extends z.ZodSchema>(
  body: unknown,
  schema: T
): ValidationError[] | null {
  try {
    schema.parse(body);
    return null;
  } catch (error) {
    if (error instanceof ZodError) {
      return error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
    }
    return [{ field: 'body', message: 'Invalid request body' }];
  }
}

/**
 * Validates query parameters against a Zod schema
 */
export function validateQuery<T extends z.ZodSchema>(
  query: unknown,
  schema: T
): ValidationError[] | null {
  try {
    schema.parse(query);
    return null;
  } catch (error) {
    if (error instanceof ZodError) {
      return error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
    }
    return [{ field: 'query', message: 'Invalid query parameters' }];
  }
}

/**
 * Sends validation error response (Pages Router)
 * @deprecated Use errors.validation() from api-response.ts for App Router
 */
export function sendValidationError(
  res: NextApiResponse,
  errors: ValidationError[]
): void {
  res.status(422).json({
    success: false,
    error: {
      code: ErrorCodes.VALIDATION_ERROR,
      message: 'Validation failed',
      details: errors,
    },
  });
}

/**
 * Helper to parse and validate request body with type inference
 */
export async function parseBody<T extends z.ZodSchema>(
  req: AuthenticatedRequest,
  res: NextApiResponse,
  schema: T
): Promise<z.infer<T> | null> {
  try {
    const body = await req.body;
    const result = schema.parse(body);
    return result;
  } catch (error) {
    if (error instanceof ZodError) {
      const errors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      sendValidationError(res, errors);
      return null;
    }
    res.status(400).json({
      success: false,
      error: {
        code: ErrorCodes.INVALID_REQUEST_FORMAT,
        message: 'Invalid request body',
      },
    });
    return null;
  }
}

/**
 * Helper to validate request query parameters
 */
export function validateRequestQuery<T extends z.ZodSchema>(
  query: Record<string, unknown>,
  schema: T
): z.infer<T> | null {
  try {
    return schema.parse(query);
  } catch {
    return null;
  }
}

// ==================== Common Validation Schemas ====================

// Pagination schema
export const paginationSchema = z.object({
  page: z.union([z.string(), z.number()]).optional().default(1),
  limit: z.union([z.string(), z.number()]).optional().default(10),
  search: z.string().optional(),
});

// Date range schema
export const dateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// ID parameter schema
export const idParamSchema = z.object({
  id: z.string().min(1, 'ID is required'),
});

// Account ID schema
export const accountIdSchema = z.object({
  id: z.string().min(1, 'Account ID is required'),
});

// ==================== Type Exports ====================

export type { AuthenticatedRequest };

// ==================== App Router Validation Helpers ====================

import { errors } from './api-response';
import { NextResponse } from 'next/server';
import type { ApiErrorResponse } from './api-types';

/**
 * Validates data against a Zod schema and returns validation errors
 * for use with App Router api-response helpers
 */
export function validateSchema<T extends z.ZodSchema>(
  data: unknown,
  schema: T
): { success: true; data: z.infer<T> } | { success: false; errors: ValidationError[] } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const validationErrors = result.error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));

  return { success: false, errors: validationErrors };
}

/**
 * Creates a standard validation error response for App Router
 */
export function createValidationErrorResponse(
  validationErrors: ValidationError[]
): NextResponse<ApiErrorResponse> {
  return errors.validation(validationErrors);
}
