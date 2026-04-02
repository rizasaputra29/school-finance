'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ROLES, type Role } from '@/lib/permissions';

export type UserRole = Role;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

interface AuthContextType {
  user: AuthUser | null;
  role: UserRole | null;
  isOwner: boolean;
  isAdmin: boolean;
  isUser: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canApprove: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  continueAsGuest: () => void;
  hasPermission: (action: PermissionAction) => boolean;
  refreshSession: () => Promise<boolean>;
}

export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'delete_critical' | 'approve';

const AuthContext = createContext<AuthContextType | null>(null);

const ROLE_PERMISSIONS: Record<UserRole, PermissionAction[]> = {
  owner: ['read', 'create', 'update', 'delete', 'delete_critical', 'approve'],
  admin: ['read', 'create', 'update', 'delete', 'approve'],
  user: ['read'],
};

function checkPermission(role: UserRole | null, action: PermissionAction): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(action) ?? false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/get-session', {
          credentials: 'include',
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data && data.user) {
            setUser({
              id: data.user.id,
              email: data.user.email,
              name: data.user.name || '',
              // Role is now properly included via customSession plugin
              role: (data.user.role as Role) || 'user',
            });
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      
      const data = await res.json();

      if (res.ok && data.user) {
        setUser({
          id: data.user.id,
          email: data.user.email,
          name: data.user.name || '',
          role: (data.user.role as Role) || 'user',
        });
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/sign-out', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout failed:', error);
    }
    setUser(null);
    window.location.href = '/login';
  };

  const refreshSession = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/get-session', {
        credentials: 'include',
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data && data.user) {
          setUser({
            id: data.user.id,
            email: data.user.email,
            name: data.user.name || '',
            role: (data.user.role as Role) || 'user',
          });
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Session refresh failed:', error);
      return false;
    }
  };

  const continueAsGuest = () => {
    // Guest mode not supported with Better Auth
    console.warn('Guest mode not supported');
  };

  const hasPermission = (action: PermissionAction): boolean => {
    return checkPermission(user?.role ?? null, action);
  };

  const role = user?.role ?? null;

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isOwner: role === 'owner',
        isAdmin: role === 'owner' || role === 'admin',
        isUser: role === 'user',
        canCreate: hasPermission('create'),
        canUpdate: hasPermission('update'),
        canDelete: hasPermission('delete'),
        canApprove: hasPermission('approve'),
        isLoading,
        login,
        logout,
        continueAsGuest,
        hasPermission,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
