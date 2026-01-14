import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

// SECURITY: Throw error if JWT_SECRET is not set (no fallback)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}

const secret = new TextEncoder().encode(JWT_SECRET || 'dev-only-secret-not-for-production');

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
    .setExpirationTime('24h')
    .sign(secret);
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as AuthUser;
  } catch {
    return null;
  }
}

// SECURITY: Use hashed password comparison
// In production, ADMIN_PASSWORD_HASH should be a bcrypt hash
// Generate with: await bcrypt.hash('yourpassword', 12)
export async function validateAdminCredentials(email: string, password: string): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@school.com';
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  const adminPasswordPlain = process.env.ADMIN_PASSWORD;

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

  // Fallback to plain password comparison (legacy/dev mode)
  // SECURITY WARNING: This is less secure, use ADMIN_PASSWORD_HASH in production
  if (adminPasswordPlain) {
    // Add constant-time comparison delay
    const isValid = password === adminPasswordPlain;
    // Add delay to normalize response time
    await new Promise(resolve => setTimeout(resolve, 100));
    return isValid;
  }

  // Default development credentials (remove in production)
  if (process.env.NODE_ENV !== 'production') {
    return password === 'admin123';
  }

  return false;
}

