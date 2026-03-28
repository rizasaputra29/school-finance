import type { NextApiRequest, NextApiResponse } from 'next';
import { createToken, validateAdminCredentials, AuthUser } from '@/lib/auth';
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

    // 2. Validate Credentials (async now for bcrypt)
    const isValid = await validateAdminCredentials(email, password);
    
    if (!isValid) {
      // Intentionally generic error properly handled on client
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    const user: AuthUser = { email, role: 'admin' };
    const token = await createToken(user);

    // 3. Set HttpOnly Cookie
    const cookie = serialize('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    res.setHeader('Set-Cookie', cookie);

    // Return user info but NOT the token in body
    // Also return token expiry info for client-side tracking
    return res.status(200).json({ 
      user,
      tokenExpiresIn: 4 * 60 * 60, // 4 hours in seconds
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
