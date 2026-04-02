'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export type UserRole = 'owner' | 'admin' | 'user';

export interface AuthUser {
  email: string;
  role: UserRole;
  tokenVersion?: number;
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
  sessionExpiresAt: number | null;
  sessionCountdown: number | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  continueAsGuest: () => void;
  hasPermission: (action: PermissionAction) => boolean;
  refreshSession: () => Promise<boolean>;
}

export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'delete_critical' | 'approve';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Permission mapping based on role
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
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [sessionCountdown, setSessionCountdown] = useState<number | null>(null);

  // Update countdown every second
  useEffect(() => {
    if (!sessionExpiresAt) return;

    const updateCountdown = () => {
      const remaining = Math.max(0, sessionExpiresAt - Date.now());
      setSessionCountdown(Math.floor(remaining / 1000));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [sessionExpiresAt]);

  // Show warning when session is about to expire (within 5 minutes)
  useEffect(() => {
    if (sessionCountdown !== null && sessionCountdown <= 300 && sessionCountdown > 0) {
      // Dispatch event for components to show warning
      window.dispatchEvent(new CustomEvent('session-warning', { 
        detail: { secondsRemaining: sessionCountdown } 
      }));
    }
  }, [sessionCountdown]);

  // Session validation on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/verify', {
          credentials: 'include', // Include cookies
        });
        
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          // Set session expiry if provided
          if (data.sessionExpiresAt) {
            setSessionExpiresAt(data.sessionExpiresAt);
          } else if (data.tokenExpiresIn) {
            setSessionExpiresAt(Date.now() + data.tokenExpiresIn * 1000);
          }
        } else {
          // Token invalid or expired - auto logout
          setUser(null);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        // Network error - treat as not authenticated
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Auto-refresh token before expiry (at 5 minutes remaining)
  useEffect(() => {
    if (!sessionCountdown || sessionCountdown > 300) return;

    const refreshTimer = setTimeout(async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          setSessionExpiresAt(data.sessionExpiresAt);
          setUser(data.user);
        } else {
          // Refresh failed - logout
          setUser(null);
          setSessionExpiresAt(null);
        }
      } catch (error) {
        console.error('Auto-refresh failed:', error);
      }
    }, (sessionCountdown - 300) * 1000);

    return () => clearTimeout(refreshTimer);
  }, [sessionCountdown]);

  // Auto-logout on token expiry via visibility change
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // Re-verify token when tab becomes visible (handles refresh)
        try {
          const res = await fetch('/api/auth/verify', {
            credentials: 'include',
          });
          
          if (!res.ok) {
            // Token invalid/expired - clear session
            setUser(null);
            setSessionExpiresAt(null);
          }
        } catch (error) {
          console.error('Session validation failed:', error);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include cookies
        body: JSON.stringify({ email, password }),
      });
      
      const data = await res.json();

      if (res.ok) {
        // Token is set in HttpOnly cookie by server
        setUser(data.user);
        // Set session expiry
        if (data.tokenExpiresIn) {
          setSessionExpiresAt(Date.now() + data.tokenExpiresIn * 1000);
        }
        return true;
      }
      
      // Handle rate limit or auth error
      if (res.status === 429) {
        console.error('Rate limit exceeded:', data.error);
        throw new Error(data.error);
      }

      return false;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setSessionExpiresAt(data.sessionExpiresAt);
        return true;
      }

      // Refresh failed
      setUser(null);
      setSessionExpiresAt(null);
      return false;
    } catch (error) {
      console.error('Session refresh failed:', error);
      return false;
    }
  }, []);

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { 
        method: 'POST',
        credentials: 'include',
      });
      setUser(null);
      setSessionExpiresAt(null);
      setSessionCountdown(null);
    } catch (error) {
      console.error('Logout failed:', error);
      // Still clear local state even if server call fails
      setUser(null);
      setSessionExpiresAt(null);
      setSessionCountdown(null);
    }
  };

  const continueAsGuest = () => {
    setUser({ email: 'guest', role: 'user' });
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
        sessionExpiresAt,
        sessionCountdown,
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
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
