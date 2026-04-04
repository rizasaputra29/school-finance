import type { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { auth } from './auth';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
  image: string | null;
}

export interface AuthenticatedRequest extends NextApiRequest {
  user: AuthUser;
}

export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'delete_critical' | 'approve';

type AuthHandler = (
  req: AuthenticatedRequest,
  res: NextApiResponse
) => Promise<void> | void;

export interface WithAuthOptions {
  requireRole?: ('owner' | 'admin' | 'user')[];
  requireOwner?: boolean;
  requireAdmin?: boolean;
  permission?: PermissionAction;
}

export function hasPermission(user: AuthUser | null, action: PermissionAction): boolean {
  if (!user) return false;

  switch (user.role) {
    case 'owner':
      return true;
    case 'admin':
      return action !== 'delete_critical';
    case 'user':
      return action === 'read';
    default:
      return false;
  }
}

export function withAuth(
  handler: AuthHandler,
  options: WithAuthOptions = {}
): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // Convert headers to Headers object
      const headers = new Headers();
      Object.entries(req.headers).forEach(([key, value]) => {
        if (typeof value === 'string') {
          headers.set(key, value);
        } else if (Array.isArray(value)) {
          value.forEach(v => headers.append(key, v));
        }
      });

      const session = await auth.api.getSession({
        headers,
      });

      if (!session) {
        return res.status(401).json({ 
          error: 'Autentikasi diperlukan',
          code: 'UNAUTHORIZED'
        });
      }

      const user = session.user as unknown as AuthUser;

      if (options.requireOwner && user.role !== 'owner') {
        return res.status(403).json({ 
          error: 'Akses ditolak. Hanya owner yang diizinkan.',
          code: 'FORBIDDEN'
        });
      }

      if (options.requireAdmin && user.role !== 'owner' && user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Akses ditolak. Hanya admin dan owner yang diizinkan.',
          code: 'FORBIDDEN'
        });
      }

      if (options.requireRole && options.requireRole.length > 0) {
        if (!options.requireRole.includes(user.role as 'owner' | 'admin' | 'user')) {
          return res.status(403).json({ 
            error: 'Akses ditolak. Peran tidak sesuai.',
            code: 'FORBIDDEN'
          });
        }
      }

      if (options.permission) {
        if (!hasPermission(user, options.permission)) {
          return res.status(403).json({ 
            error: 'Akses ditolak. Anda tidak memiliki izin untuk operasi ini.',
            code: 'FORBIDDEN'
          });
        }
      }

      (req as AuthenticatedRequest).user = user;

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

export async function getAuthUser(req: NextApiRequest): Promise<AuthUser | null> {
  try {
    const headers = new Headers();
    Object.entries(req.headers).forEach(([key, value]) => {
      if (typeof value === 'string') {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        value.forEach(v => headers.append(key, v));
      }
    });

    const session = await auth.api.getSession({
      headers,
    });

    return session ? (session.user as unknown as AuthUser) : null;
  } catch {
    return null;
  }
}
