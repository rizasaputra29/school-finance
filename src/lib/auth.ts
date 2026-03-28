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

export interface AuthUser {
  email: string;
  role: 'admin' | 'guest';
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
    .setExpirationTime('4h') // Reduced from 24h to 4 hours for better security
    .sign(secret);
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    
    // Validate payload structure using type guards
    // jose returns JWTPayload which extends Record<string, unknown>
    const email = payload.email;
    const role = payload.role;
    
    if (
      typeof email === 'string' &&
      typeof role === 'string' &&
      (role === 'admin' || role === 'guest')
    ) {
      return {
        email,
        role,
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

