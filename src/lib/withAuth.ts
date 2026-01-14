import type { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { verifyToken, AuthUser } from './auth';

export interface AuthenticatedRequest extends NextApiRequest {
  user: AuthUser;
}

type AuthHandler = (
  req: AuthenticatedRequest,
  res: NextApiResponse
) => Promise<void> | void;

interface WithAuthOptions {
  requireAdmin?: boolean;
}

/**
 * Middleware to protect API routes with authentication
 * 
 * Usage:
 * ```ts
 * export default withAuth(async (req, res) => {
 *   // req.user is available here
 * }, { requireAdmin: true });
 * ```
 */
export function withAuth(
  handler: AuthHandler,
  options: WithAuthOptions = {}
): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // Get token from Authorization header or cookie
      let token: string | undefined;

      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }

      // Also check cookie
      if (!token && req.cookies.auth_token) {
        token = req.cookies.auth_token;
      }

      if (!token) {
        return res.status(401).json({ 
          error: 'Autentikasi diperlukan',
          code: 'UNAUTHORIZED'
        });
      }

      // Verify the token
      const user = await verifyToken(token);
      if (!user) {
        return res.status(401).json({ 
          error: 'Token tidak valid atau sudah kadaluarsa',
          code: 'INVALID_TOKEN'
        });
      }

      // Check admin requirement
      if (options.requireAdmin && user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Akses ditolak. Hanya admin yang diizinkan.',
          code: 'FORBIDDEN'
        });
      }

      // Attach user to request
      (req as AuthenticatedRequest).user = user;

      // Call the handler
      return handler(req as AuthenticatedRequest, res);
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(500).json({ 
        error: 'Terjadi kesalahan server',
        code: 'INTERNAL_ERROR'
      });
    }
  };
}

/**
 * Helper to check if request is authenticated (for optional auth)
 */
export async function getAuthUser(req: NextApiRequest): Promise<AuthUser | null> {
  try {
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (!token && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    if (!token) {
      return null;
    }

    return await verifyToken(token);
  } catch {
    return null;
  }
}
