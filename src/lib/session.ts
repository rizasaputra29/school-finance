/**
 * Session Management
 * 
 * Tracks active sessions with token versioning for security.
 * Invalidates old tokens on refresh (token rotation).
 */

import { AuthUser } from './auth';

// Session expiry: configurable via env (default 4 hours)
const SESSION_EXPIRY_HOURS = parseInt(process.env.SESSION_EXPIRY_HOURS || '4', 10);
export const SESSION_EXPIRY_MS = SESSION_EXPIRY_HOURS * 60 * 60 * 1000;

// In-memory session store (use Redis in production)
// Key: email, Value: session data
interface SessionData {
  tokenVersion: number;
  createdAt: number;
  expiresAt: number;
  lastRefreshAt: number;
}

const sessions = new Map<string, SessionData>();

/**
 * Create a new session for user
 */
export function createSession(user: AuthUser): number {
  const tokenVersion = 1;
  const now = Date.now();
  
  const sessionData: SessionData = {
    tokenVersion,
    createdAt: now,
    expiresAt: now + SESSION_EXPIRY_MS,
    lastRefreshAt: now,
  };
  
  sessions.set(user.email, sessionData);
  return tokenVersion;
}

/**
 * Get session for user
 */
export function getSession(email: string): SessionData | null {
  const session = sessions.get(email);
  
  if (!session) {
    return null;
  }
  
  // Check if session expired
  if (Date.now() > session.expiresAt) {
    invalidateSession(email);
    return null;
  }
  
  return session;
}

/**
 * Validate token version against stored session
 */
export function validateSession(email: string, tokenVersion: number): boolean {
  const session = getSession(email);
  
  if (!session) {
    return false;
  }
  
  return session.tokenVersion === tokenVersion;
}

/**
 * Refresh session - invalidate old token, issue new version
 * Returns new token version if successful, null if failed
 */
export function refreshSession(user: AuthUser): number | null {
  const currentSession = getSession(user.email);
  
  // If no valid session, create new one
  if (!currentSession) {
    return createSession(user);
  }
  
  // Increment token version (invalidates old token)
  const newVersion = currentSession.tokenVersion + 1;
  const now = Date.now();
  
  const updatedSession: SessionData = {
    tokenVersion: newVersion,
    createdAt: currentSession.createdAt,
    expiresAt: now + SESSION_EXPIRY_MS,
    lastRefreshAt: now,
  };
  
  sessions.set(user.email, updatedSession);
  return newVersion;
}

/**
 * Invalidate session (logout)
 */
export function invalidateSession(email: string): void {
  sessions.delete(email);
}

/**
 * Clean up expired sessions (call periodically)
 */
export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [email, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(email);
      cleaned++;
    }
  }
  
  return cleaned;
}

// Auto-cleanup every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredSessions, 10 * 60 * 1000);
}

/**
 * Get session info for client (without sensitive data)
 */
export function getSessionInfo(email: string): { 
  expiresAt: number; 
  lastRefreshAt: number;
  tokenVersion: number;
} | null {
  const session = getSession(email);
  
  if (!session) {
    return null;
  }
  
  return {
    expiresAt: session.expiresAt,
    lastRefreshAt: session.lastRefreshAt,
    tokenVersion: session.tokenVersion,
  };
}

/**
 * Check if session needs refresh (within 5 minutes of expiry)
 */
export function needsRefresh(email: string): boolean {
  const session = getSession(email);
  
  if (!session) {
    return false;
  }
  
  // Refresh if less than 5 minutes remaining
  const fiveMinutes = 5 * 60 * 1000;
  return (session.expiresAt - Date.now()) < fiveMinutes;
}

/**
 * Get remaining time until expiry in seconds
 */
export function getRemainingTime(email: string): number | null {
  const session = getSession(email);
  
  if (!session) {
    return null;
  }
  
  const remaining = Math.max(0, session.expiresAt - Date.now());
  return Math.floor(remaining / 1000);
}