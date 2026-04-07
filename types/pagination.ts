/**
 * Pagination Types
 * Shared type definitions for pagination across the application
 * 
 * NOTE: For API responses, use PaginationMeta from @/lib/api/api-types
 * This interface is for component-level pagination state
 */

export interface Pagination {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
}