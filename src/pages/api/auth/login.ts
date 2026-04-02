import type { NextApiRequest, NextApiResponse } from 'next';
import { createTokenWithVersion, validateOwnerCredentials, validateAdminCredentials, AuthUser, getCookieOptions } from '@/lib/auth';
import { createSession, SESSION_EXPIRY_MS } from '@/lib/session';
import { rateLimit, RATE_LIMITS, getClientIp, formatRateLimitError } from '@/lib/rate-limit';
import { serialize } from 'cookie';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Rate Limiting
  const ip = getClientIp(req);
  const identifier = `login:${ip}`;
  const rateLimitResult = rateLimit(identifier, RATE_LIMITS.login);

  if (!rateLimitResult.success) {
    res.setHeader('Retry-After', Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
    return res.status(429).json({ 
      error: formatRateLimitError(rateLimitResult),
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password diperlukan' });
    }

    // 2. Check credentials - try owner first, then admin
    // Owner has highest priority
    const isOwnerValid = await validateOwnerCredentials(email, password);
    if (isOwnerValid) {
      const user: AuthUser = { email, role: 'owner' };
      
      // Create session
      const tokenVersion = createSession(user);
      
      // Create token with version
      const token = await createTokenWithVersion(user, tokenVersion);

      // Set HttpOnly Cookie with secure options
      const cookieOptions = getCookieOptions();
      const cookie = serialize('auth_token', token, cookieOptions);

      res.setHeader('Set-Cookie', cookie);

      return res.status(200).json({ 
        user,
        tokenExpiresIn: SESSION_EXPIRY_MS / 1000,
        tokenVersion,
      });
    }

    // Then check admin credentials
    const isAdminValid = await validateAdminCredentials(email, password);
    if (isAdminValid) {
      const user: AuthUser = { email, role: 'admin' };
      
      // Create session
      const tokenVersion = createSession(user);
      
      // Create token with version
      const token = await createTokenWithVersion(user, tokenVersion);

      // Set HttpOnly Cookie with secure options
      const cookieOptions = getCookieOptions();
      const cookie = serialize('auth_token', token, cookieOptions);

      res.setHeader('Set-Cookie', cookie);

      return res.status(200).json({ 
        user,
        tokenExpiresIn: SESSION_EXPIRY_MS / 1000,
        tokenVersion,
      });
    }

    // Invalid credentials
    return res.status(401).json({ error: 'Email atau password salah' });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
