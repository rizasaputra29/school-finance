import type { NextApiRequest, NextApiResponse } from 'next';
import { createToken, validateAdminCredentials, AuthUser } from '@/lib/auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan password diperlukan' });
    }

    if (!validateAdminCredentials(email, password)) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    const user: AuthUser = { email, role: 'admin' };
    const token = await createToken(user);

    return res.status(200).json({ token, user });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
