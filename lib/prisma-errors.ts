/**
 * Prisma Error Handler
 * Maps Prisma errors to HTTP responses
 */

import { Prisma } from '@prisma/client';
import { ErrorCodes } from './error-codes';
import { error as createErrorResponse, errors } from './api-response';
import { NextResponse } from 'next/server';

export interface PrismaErrorResult {
  status: number;
  code: string;
  message: string;
}

/**
 * Handle Prisma errors and map to HTTP status codes
 */
export function handlePrismaError(error: unknown): PrismaErrorResult {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return {
          status: 409,
          code: ErrorCodes.RESOURCE_ALREADY_EXISTS,
          message: 'Resource with this identifier already exists',
        };
      case 'P2025':
        return {
          status: 404,
          code: ErrorCodes.RESOURCE_NOT_FOUND,
          message: 'Requested resource not found',
        };
      case 'P2003':
        return {
          status: 422,
          code: ErrorCodes.RELATED_RESOURCE_NOT_FOUND,
          message: 'Related resource does not exist',
        };
      case 'P2014':
        return {
          status: 422,
          code: ErrorCodes.RELATION_VIOLATION,
          message: 'This operation would violate data relationships',
        };
      case 'P2028':
        return {
          status: 500,
          code: ErrorCodes.TRANSACTION_FAILED,
          message: 'Database transaction failed',
        };
      case 'P2024':
        return {
          status: 503,
          code: ErrorCodes.DATABASE_ERROR,
          message: 'Database connection timeout',
        };
      default:
        return {
          status: 500,
          code: ErrorCodes.DATABASE_ERROR,
          message: 'Database operation failed',
        };
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return {
      status: 400,
      code: ErrorCodes.INVALID_REQUEST_FORMAT,
      message: 'Invalid request data format',
    };
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return {
      status: 500,
      code: ErrorCodes.DATABASE_ERROR,
      message: 'Database connection failed',
    };
  }

  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return {
      status: 500,
      code: ErrorCodes.INTERNAL_ERROR,
      message: 'Database engine error',
    };
  }

  return {
    status: 500,
    code: ErrorCodes.INTERNAL_ERROR,
    message: 'An unexpected error occurred',
  };
}

/**
 * Check if error is a Prisma not found error
 */
export function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}

/**
 * Check if error is a Prisma duplicate error
 */
export function isDuplicateError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/**
 * Convert Prisma error to proper NextResponse
 * This should be used in catch blocks to return proper error responses
 */
export function prismaErrorToResponse(err: unknown): NextResponse {
  const result = handlePrismaError(err);
  return createErrorResponse(result.message, result.code, { status: result.status });
}

/**
 * Handle Prisma error and return appropriate error response
 * Convenience function that combines handlePrismaError and error()
 */
export function handlePrismaErrorResponse(error: unknown): NextResponse {
  if (isNotFoundError(error)) {
    return errors.notFound('Resource');
  }
  if (isDuplicateError(error)) {
    return errors.conflict('Resource already exists');
  }
  return prismaErrorToResponse(error);
}
