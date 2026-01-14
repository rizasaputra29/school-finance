import { LRUCache } from 'lru-cache';

export interface RateLimitConfig {
  interval: number; // in milliseconds
  limit: number;
}

// In-memory cache for rate limiting (works in serverless)
const rateLimitCache = new LRUCache<string, number[]>({
  max: 500, // Max 500 unique IPs
  ttl: 60 * 60 * 1000, // 1 hour TTL
});

export function getClientIp(request: Request | { headers: { [key: string]: string | string[] | undefined }, socket?: { remoteAddress?: string } }): string {
  // Check various headers in order of preference
  const headers = request.headers;
  
  // Handle both Headers object and plain object
  const getHeader = (name: string): string | undefined => {
    if (headers instanceof Headers) {
      return headers.get(name) || undefined;
    }
    const value = (headers as Record<string, string | string[] | undefined>)[name];
    return Array.isArray(value) ? value[0] : value;
  };

  // Check X-Forwarded-For header (commonly set by proxies/load balancers)
  const forwardedFor = getHeader('x-forwarded-for');
  if (forwardedFor) {
    // Get the first IP in the chain (client IP)
    return forwardedFor.split(',')[0].trim();
  }

  // Check X-Real-IP header (set by Nginx)
  const realIp = getHeader('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Check CF-Connecting-IP (Cloudflare)
  const cfIp = getHeader('cf-connecting-ip');
  if (cfIp) {
    return cfIp;
  }

  // Fallback to socket remote address
  if ('socket' in request && request.socket?.remoteAddress) {
    return request.socket.remoteAddress;
  }

  return 'unknown';
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number; // timestamp when rate limit resets
}

export function rateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - config.interval;

  // Get existing timestamps for this identifier
  const timestamps = rateLimitCache.get(identifier) || [];

  // Filter out timestamps outside the current window
  const recentTimestamps = timestamps.filter((ts) => ts > windowStart);

  // Check if limit exceeded
  if (recentTimestamps.length >= config.limit) {
    const oldestTimestamp = recentTimestamps[0];
    const resetTime = oldestTimestamp + config.interval;
    
    return {
      success: false,
      remaining: 0,
      reset: resetTime,
    };
  }

  // Add current timestamp and update cache
  recentTimestamps.push(now);
  rateLimitCache.set(identifier, recentTimestamps);

  return {
    success: true,
    remaining: config.limit - recentTimestamps.length,
    reset: now + config.interval,
  };
}

// Preset configurations
export const RATE_LIMITS = {
  // Login: 5 attempts per 15 minutes
  login: { interval: 15 * 60 * 1000, limit: 5 },
  // API: 100 requests per minute
  api: { interval: 60 * 1000, limit: 100 },
  // Reset: 1 attempt per hour
  reset: { interval: 60 * 60 * 1000, limit: 1 },
  // Import: 10 attempts per hour
  import: { interval: 60 * 60 * 1000, limit: 10 },
};

// Helper to format rate limit error message
export function formatRateLimitError(result: RateLimitResult): string {
  const waitSeconds = Math.ceil((result.reset - Date.now()) / 1000);
  const waitMinutes = Math.ceil(waitSeconds / 60);
  
  if (waitMinutes > 1) {
    return `Terlalu banyak percobaan. Coba lagi dalam ${waitMinutes} menit.`;
  }
  return `Terlalu banyak percobaan. Coba lagi dalam ${waitSeconds} detik.`;
}
