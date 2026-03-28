import { createHash } from 'crypto';
import { LRUCache } from 'lru-cache';

/**
 * Idempotency utility for API routes
 * 
 * Idempotency ensures that the same request can be made multiple times
 * without producing different results. This is crucial for:
 * - Payment processing
 * - Duplicate request prevention
 * - Network error recovery
 * 
 * Usage:
 * 1. Generate an idempotency key from request data
 * 2. Check if the key was already processed
 * 3. If yes, return cached result
 * 4. If no, process and cache the result
 */

// In-memory idempotency cache
const idempotencyCache = new LRUCache<string, IdempotencyRecord>({
  max: 1000,
  ttl: 24 * 60 * 60 * 1000, // 24 hours
});

export interface IdempotencyRecord {
  result: unknown;
  createdAt: number;
}

/**
 * Generates an idempotency key from request data
 * Uses SHA-256 hash for consistent key generation
 */
export function generateIdempotencyKey(data: {
  method: string;
  path: string;
  body?: unknown;
  userId?: string;
}): string {
  const payload = JSON.stringify({
    method: data.method,
    path: data.path,
    body: data.body,
    userId: data.userId,
  });
  
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Gets cached result for idempotency key
 * Returns null if not found or expired
 */
export function getIdempotencyResult<T>(key: string): T | null {
  const record = idempotencyCache.get(key);
  if (!record) return null;
  
  // Check if expired (24 hours)
  if (Date.now() - record.createdAt > 24 * 60 * 60 * 1000) {
    idempotencyCache.delete(key);
    return null;
  }
  
  return record.result as T;
}

/**
 * Stores result for idempotency key
 */
export function setIdempotencyResult<T>(key: string, result: T): void {
  idempotencyCache.set(key, {
    result,
    createdAt: Date.now(),
  });
}

/**
 * Deletes idempotency key (optional cleanup)
 */
export function deleteIdempotencyKey(key: string): void {
  idempotencyCache.delete(key);
}

/**
 * Creates an idempotent operation handler
 * Use this to wrap create/update operations
 * 
 * @example
 * const result = await withIdempotency(
 *   key,
 *   async () => {
 *     // Your create logic here
 *     return await prisma.account.create({ data });
 *   }
 * );
 */
export async function withIdempotency<T>(
  key: string,
  operation: () => Promise<T>
): Promise<T> {
  // Check if already processed
  const cachedResult = getIdempotencyResult<T>(key);
  if (cachedResult !== null) {
    return cachedResult;
  }
  
  // Execute operation
  const result = await operation();
  
  // Cache the result
  setIdempotencyResult(key, result);
  
  return result;
}

/**
 * Extracts idempotency key from request headers
 * Looks for X-Idempotency-Key header
 */
export function getIdempotencyKeyFromRequest(
  req: { headers: Record<string, string | string[] | undefined> }
): string | null {
  const header = req.headers['x-idempotency-key'];
  if (!header) return null;
  
  // Handle array of headers
  if (Array.isArray(header)) {
    return header[0] || null;
  }
  
  return header;
}

/**
 * Validates idempotency key format
 * Should be a valid UUID or similar unique identifier
 */
export function isValidIdempotencyKey(key: string): boolean {
  // Basic validation - must be at least 16 characters
  return typeof key === 'string' && key.length >= 16;
}
