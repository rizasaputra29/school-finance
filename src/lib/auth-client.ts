import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
});

export const { 
  useSession, 
  signIn,
  signOut,
  signUp,
} = authClient;

// Type exports based on Better Auth inference
export type Session = {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    emailVerified: boolean;
    image: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  session: {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
};

export type User = Session['user'];
