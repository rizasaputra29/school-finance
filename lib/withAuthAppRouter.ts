import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'delete_critical' | 'approve';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: 'owner' | 'admin' | 'user';
}

// Extend Better Auth user type to include role from additionalFields
interface BetterAuthUser {
  id: string;
  email: string;
  name?: string;
  role?: 'owner' | 'admin' | 'user';
}

export interface WithAuthOptions {
  requireAdmin?: boolean;
  requireOwner?: boolean;
  action?: PermissionAction;
}

export async function getAuthUser(_request: NextRequest): Promise<AuthUser | null> {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({
      headers: headersList,
    });
    
    if (!session?.user) return null;
    
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: (session.user as BetterAuthUser).role || 'user',
    };
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

export function hasPermission(user: AuthUser | null, action: PermissionAction): boolean {
  if (!user) return false;
  
  const roleHierarchy: Record<string, number> = {
    owner: 3,
    admin: 2,
    user: 1,
  };
  
  const userLevel = roleHierarchy[user.role] || 0;
  
  switch (action) {
    case 'read':
      return userLevel >= 1;
    case 'create':
    case 'update':
      return userLevel >= 1;
    case 'delete':
      return userLevel >= 2;
    case 'delete_critical':
    case 'approve':
      return userLevel >= 2;
    default:
      return false;
  }
}

export async function withAuthAppRouter(
  request: NextRequest,
  handler: (user: AuthUser) => Promise<NextResponse>,
  options: WithAuthOptions = {}
): Promise<NextResponse> {
  const user = await getAuthUser(request);
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  if (options.requireOwner && user.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden - Owner only' }, { status: 403 });
  }
  
  if (options.requireAdmin && user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 });
  }
  
  if (options.action && !hasPermission(user, options.action)) {
    return NextResponse.json({ error: 'Forbidden - Insufficient permissions' }, { status: 403 });
  }
  
  return handler(user);
}

// Helper to parse query params from URL
export function getQueryParams(request: NextRequest): Record<string, string> {
  const params: Record<string, string> = {};
  const searchParams = request.nextUrl.searchParams;
  
  searchParams.forEach((value, key) => {
    params[key] = value;
  });
  
  return params;
}
