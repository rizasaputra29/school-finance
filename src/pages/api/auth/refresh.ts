import type { NextApiRequest, NextApiResponse } from 'next';
import { createTokenWithVersion, verifyToken, getCookieOptions } from '@/lib/auth';
import { SESSION_EXPIRY_MS, refreshSession, validateSession, getSessionInfo } from '@/lib/session';
import { serialize } from 'cookie';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get current token from header or cookie
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (!token && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    if (!token) {
      return res.status(401).json({ 
        error: 'Token diperlukan untuk refresh',
        code: 'NO_TOKEN'
      });
    }

    // Verify current token
    const user = await verifyToken(token);
    if (!user) {
      return res.status(401).json({ 
        error: 'Token tidak valid atau sudah kadaluarsa',
        code: 'INVALID_TOKEN'
      });
    }

    // Validate session
    const isValidSession = validateSession(user.email, user.tokenVersion || 1);
    if (!isValidSession) {
      return res.status(401).json({ 
        error: 'Sesi telah berakhir. Silakan login ulang.',
        code: 'SESSION_INVALIDATED'
      });
    }

    // Refresh session (invalidates old token, creates new version)
    const newTokenVersion = refreshSession(user);
    if (!newTokenVersion) {
      return res.status(500).json({ 
        error: 'Gagal memperbarui sesi',
        code: 'SESSION_ERROR'
      });
    }

    // Create new token with version
    const newToken = await createTokenWithVersion(user, newTokenVersion);

    // Set new HttpOnly Cookie with secure options
    const cookieOptions = getCookieOptions();
    const cookie = serialize('auth_token', newToken, cookieOptions);

    res.setHeader('Set-Cookie', cookie);

    // Get updated session info
    const sessionInfo = getSessionInfo(user.email);

    return res.status(200).json({ 
      user,
      tokenExpiresIn: SESSION_EXPIRY_MS / 1000,
      sessionExpiresAt: sessionInfo?.expiresAt || Date.now() + SESSION_EXPIRY_MS,
      tokenVersion: newTokenVersion,
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
}