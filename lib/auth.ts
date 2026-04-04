import { betterAuth, BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { customSession } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import prisma from "./prisma";

// Define options separately for type inference
const options = {
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  // Custom table names to avoid conflicts with existing Account table
  user: {
    modelName: "User",
    additionalFields: {
      role: {
        type: ["owner", "admin", "user"],
        required: true,
        defaultValue: "user",
        input: false, // don't allow user to set role during signup
      },
      department: {
        type: "string",
        required: false,
      },
    },
  },
  session: {
    modelName: "Session",
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
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

  // Cookie configuration in advanced
  advanced: {
    defaultCookieAttributes: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
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
} satisfies BetterAuthOptions;

export const auth = betterAuth({
  ...options,
  plugins: [
    // Add customSession plugin to include role in session response
    // Pass options as second parameter for proper type inference
    customSession(async ({ user, session }) => {
      return {
        user: {
          ...user, // Includes role and other additionalFields
        },
        session,
      };
    }, options),
    nextCookies(), // MUST be last plugin for App Router support
  ],
});

// Export auth type for use in other files
export type AuthType = typeof auth;
