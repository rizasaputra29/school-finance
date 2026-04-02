import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

// SECURITY: Throw error if JWT_SECRET is not set (no fallback)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}

const secret = new TextEncoder().encode(
  JWT_SECRET || (process.env.NODE_ENV === 'production' 
    ? (() => { throw new Error('JWT_SECRET required in production'); })() 
    : 'dev-only-secret-not-for-production')
);

// Session expiry hours (configurable via env)
const SESSION_EXPIRY_HOURS = parseInt(process.env.SESSION_EXPIRY_HOURS || '4', 10);

export type UserRole = 'owner' | 'admin' | 'user';

/**
 * Get secure cookie options based on environment
 */
export function getCookieOptions() {
  const maxAge = SESSION_EXPIRY_HOURS * 60 * 60;
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge,
    path: '/',
  };
}

/**
 * Get cookie options for clearing (logout)
 */
export function getClearCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    expires: new Date(0),
    path: '/',
  };
}

export interface AuthUser {
  id?: string;
  email: string;
  role: UserRole;
  tokenVersion?: number;
}

export interface TokenPayload extends AuthUser {
  tokenVersion?: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export async function createToken(user: AuthUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_EXPIRY_HOURS}h`)
    .sign(secret);
}

/**
 * Create token with version embedded (for session tracking)
 */
export async function createTokenWithVersion(user: AuthUser, tokenVersion: number): Promise<string> {
  return new SignJWT({ ...user, tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_EXPIRY_HOURS}h`)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    
    // Validate payload structure using type guards
    // jose returns JWTPayload which extends Record<string, unknown>
    const email = payload.email;
    const role = payload.role;
    const tokenVersion = payload.tokenVersion;
    
    if (
      typeof email === 'string' &&
      typeof role === 'string' &&
      (role === 'owner' || role === 'admin' || role === 'user')
    ) {
      return {
        email,
        role,
        tokenVersion: typeof tokenVersion === 'number' ? tokenVersion : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// SECURITY: Use hashed password comparison
// In production, ADMIN_PASSWORD_HASH should be a bcrypt hash
// Generate with: await bcrypt.hash('yourpassword', 12)

/**
 * Validate owner credentials from environment
 */
export async function validateOwnerCredentials(email: string, password: string): Promise<boolean> {
  const ownerEmail = process.env.OWNER_EMAIL;
  const ownerPasswordHash = process.env.OWNER_PASSWORD_HASH;
  const ownerPasswordPlain = process.env.OWNER_PASSWORD;

  // Require proper configuration
  if (!ownerEmail) {
    await new Promise(resolve => setTimeout(resolve, 100));
    return false;
  }

  // Check email first
  if (email !== ownerEmail) {
    await new Promise(resolve => setTimeout(resolve, 100));
    return false;
  }

  // Prefer hashed password if available
  if (ownerPasswordHash) {
    return bcrypt.compare(password, ownerPasswordHash);
  }

  // Fallback to plain password comparison (dev mode only)
  if (ownerPasswordPlain) {
    const isValid = password === ownerPasswordPlain;
    await new Promise(resolve => setTimeout(resolve, 100));
    return isValid;
  }

  await new Promise(resolve => setTimeout(resolve, 100));
  return false;
}

/**
 * Validate admin credentials from environment
 */
export async function validateAdminCredentials(email: string, password: string): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  const adminPasswordPlain = process.env.ADMIN_PASSWORD;

  // Require proper configuration in production
  if (process.env.NODE_ENV === 'production') {
    if (!adminEmail || (!adminPasswordHash && !adminPasswordPlain)) {
      console.error('CRITICAL: Admin credentials not configured in production');
      return false;
    }
  }

  // If no admin email configured, reject
  if (!adminEmail) {
    await new Promise(resolve => setTimeout(resolve, 100));
    return false;
  }

  // Check email first
  if (email !== adminEmail) {
    // Add small delay to prevent timing attacks
    await new Promise(resolve => setTimeout(resolve, 100));
    return false;
  }

  // Prefer hashed password if available
  if (adminPasswordHash) {
    return bcrypt.compare(password, adminPasswordHash);
  }

  // Fallback to plain password comparison (legacy/dev mode only)
  // SECURITY WARNING: This is less secure, use ADMIN_PASSWORD_HASH in production
  if (adminPasswordPlain) {
    // Add constant-time comparison delay
    const isValid = password === adminPasswordPlain;
    // Add delay to normalize response time
    await new Promise(resolve => setTimeout(resolve, 100));
    return isValid;
  }

  // NO default credentials in production - explicitly fail
  if (process.env.NODE_ENV === 'production') {
    await new Promise(resolve => setTimeout(resolve, 100));
    return false;
  }

  // Development mode only - require explicit ADMIN_PASSWORD env var
  // Removed hardcoded 'admin123' fallback
  await new Promise(resolve => setTimeout(resolve, 100));
  return false;
}

/**
 * Check if user has permission to perform an action
 * Owner: full access
 * Admin: can create/update, cannot delete critical data
 * User: read-only
 */
export function hasPermission(user: AuthUser | null, action: PermissionAction): boolean {
  if (!user) return false;

  switch (user.role) {
    case 'owner':
      return true; // Full access
    case 'admin':
      return action !== 'delete_critical'; // Can do everything except delete critical
    case 'user':
      return action === 'read'; // Read-only
    default:
      return false;
  }
}

export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'delete_critical' | 'approve';

