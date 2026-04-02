import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import { verifyToken, getClearCookieOptions } from '@/lib/auth';
import { invalidateSession } from '@/lib/session';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Try to invalidate session if token is present
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }
  if (!token && req.cookies.auth_token) {
    token = req.cookies.auth_token;
  }

  if (token) {
    const user = await verifyToken(token);
    if (user) {
      invalidateSession(user.email);
    }
  }

  // Clear the auth cookie using secure options
  const cookieOptions = getClearCookieOptions();
  const cookie = serialize('auth_token', '', cookieOptions);

  res.setHeader('Set-Cookie', cookie);
  return res.status(200).json({ message: 'Logged out successfully' });
}
