/**
 * API Response Types
 * Standard type definitions for API responses
 */

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message: string;
  meta?: {
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    summary?: Record<string, number | boolean | string | Record<string, unknown>>;
    filters?: Record<string, unknown>;
    year?: number;
    accounts?: Record<string, {
      kodeAkun: string;
      namaAkun?: string;
      tipeAkun?: string;
    }>;
    [key: string]: unknown;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{
      field?: string;
      message: string;
      code?: string;
    }>;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
