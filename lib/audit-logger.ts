import { Prisma } from "@prisma/client";
import prisma from "./prisma";

interface AuditDetails {
  before?: unknown;
  after?: unknown;
  [key: string]: unknown;
}

interface AuditLogData {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: AuditDetails;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAudit(data: AuditLogData) {
  try {
    await prisma.auditTrail.create({
      data: {
        action: data.action,
        entity: data.resource,
        entityId: data.resourceId || "",
        oldData: data.details?.before ? data.details.before as Prisma.InputJsonValue : undefined,
        newData: (data.details?.after || data.details) as Prisma.InputJsonValue | undefined,
        userId: data.userId,
        ipAddress: data.ipAddress,
      },
    });
  } catch (error) {
    console.error("Audit logging failed:", error);
  }
}

export async function logCreate<T>(
  userId: string,
  resource: string,
  resourceId: string,
  data: T
) {
  await logAudit({
    userId,
    action: "create",
    resource,
    resourceId,
    details: { after: data },
  });
}

export async function logUpdate<T>(
  userId: string,
  resource: string,
  resourceId: string,
  oldData: T,
  newData: T
) {
  await logAudit({
    userId,
    action: "update",
    resource,
    resourceId,
    details: { before: oldData, after: newData },
  });
}

export async function logDelete<T>(
  userId: string,
  resource: string,
  resourceId: string,
  data: T
) {
  await logAudit({
    userId,
    action: "delete",
    resource,
    resourceId,
    details: { before: data },
  });
}
