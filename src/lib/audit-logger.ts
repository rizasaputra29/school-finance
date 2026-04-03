import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface AuditLogData {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
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
        oldData: data.details?.before || null,
        newData: data.details?.after || data.details,
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
