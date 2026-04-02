import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyToken } from '@/lib/auth';
import { validateSession, getSessionInfo, SESSION_EXPIRY_MS } from '@/lib/session';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Support both Authorization header and cookie
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    // Also check cookie (like withAuth middleware)
    if (!token && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Token tidak ditemukan' });
    }

    const user = await verifyToken(token);

    if (!user) {
      return res.status(401).json({ error: 'Token tidak valid atau sudah kadaluarsa' });
    }

    // Validate session
    const isValidSession = validateSession(user.email, user.tokenVersion || 1);
    if (!isValidSession) {
      return res.status(401).json({ 
        error: 'Sesi telah berakhir. Silakan login ulang.',
        code: 'SESSION_INVALIDATED'
      });
    }

    // Get session info
    const sessionInfo = getSessionInfo(user.email);
    const tokenExpiresIn = SESSION_EXPIRY_MS / 1000;

    return res.status(200).json({ 
      user,
      tokenExpiresIn,
      sessionExpiresAt: sessionInfo?.expiresAt || null,
    });
  } catch (error) {
    console.error('Verify error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
