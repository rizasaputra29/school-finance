import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "./prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  
  // Custom table names to avoid conflicts with existing Account table
  user: {
    modelName: "User",
  },
  session: {
    modelName: "Session",
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  },
  account: {
    modelName: "AuthAccount",
    fields: {
      userId: "userId",
      accountId: "accountId",
      providerId: "providerId",
    }
  },
  verification: {
    modelName: "Verification",
  },
  
  // Custom fields for RBAC
  additionalFields: {
    role: {
      type: "string",
      required: true,
      defaultValue: "user",
    },
    department: {
      type: "string",
      required: false,
    },
  },
  
  // Email/Password only
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: false,
  },
});

// Export auth type for use in other files
export type AuthType = typeof auth;
