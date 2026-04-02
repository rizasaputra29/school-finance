import type { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { verifyToken, AuthUser, hasPermission, PermissionAction } from './auth';
import { validateSession } from './session';

export interface AuthenticatedRequest extends NextApiRequest {
  user: AuthUser;
}

type AuthHandler = (
  req: AuthenticatedRequest,
  res: NextApiResponse
) => Promise<void> | void;

export interface WithAuthOptions {
  /** Require specific role(s) to access */
  requireRole?: ('owner' | 'admin' | 'user')[];
  /** Require owner role (shorthand for requireRole: ['owner']) */
  requireOwner?: boolean;
  /** Require admin role (shorthand for requireRole: ['owner', 'admin']) */
  requireAdmin?: boolean;
  /** Permission action to check */
  permission?: PermissionAction;
}

/**
 * Middleware to protect API routes with authentication and role-based access control
 * 
 * Usage:
 * ```ts
 * // Require specific role
 * export default withAuth(async (req, res) => {
 *   // req.user is available here
 * }, { requireRole: ['owner', 'admin'] });
 * 
 * // Require owner only
 * export default withAuth(handler, { requireOwner: true });
 * 
 * // Require admin or owner
 * export default withAuth(handler, { requireAdmin: true });
 * 
 * // Check permission action
 * export default withAuth(handler, { permission: 'create' });
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

      // Validate session
      const isValidSession = validateSession(user.email, user.tokenVersion || 1);
      if (!isValidSession) {
        return res.status(401).json({ 
          error: 'Sesi telah berakhir. Silakan login ulang.',
          code: 'SESSION_INVALIDATED'
        });
      }

      // Check owner requirement
      if (options.requireOwner && user.role !== 'owner') {
        return res.status(403).json({ 
          error: 'Akses ditolak. Hanya owner yang diizinkan.',
          code: 'FORBIDDEN'
        });
      }

      // Check admin requirement (owner and admin)
      if (options.requireAdmin && user.role !== 'owner' && user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Akses ditolak. Hanya admin dan owner yang diizinkan.',
          code: 'FORBIDDEN'
        });
      }

      // Check specific role requirement
      if (options.requireRole && options.requireRole.length > 0) {
        if (!options.requireRole.includes(user.role as 'owner' | 'admin' | 'user')) {
          return res.status(403).json({ 
            error: 'Akses ditolak. Peran tidak sesuai.',
            code: 'FORBIDDEN'
          });
        }
      }

      // Check permission action
      if (options.permission) {
        if (!hasPermission(user, options.permission)) {
          return res.status(403).json({ 
            error: 'Akses ditolak. Anda tidak memiliki izin untuk operasi ini.',
            code: 'FORBIDDEN'
          });
        }
      }

      // Attach user to request
      (req as AuthenticatedRequest).user = user;

      // Call the handler
      return handler(req as AuthenticatedRequest, res);
    } catch (error) {
      console.error('Auth middleware error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ 
        error: 'Terjadi kesalahan server',
        code: 'INTERNAL_ERROR',
        details: process.env.NODE_ENV !== 'production' ? message : undefined
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
