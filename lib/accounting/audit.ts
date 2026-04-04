

export interface AuditTrailEntry {
  userId?: string;
  userEmail?: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Create audit trail entry
 */
export async function createAuditTrail(entry: AuditTrailEntry): Promise<void> {
  try {
    // For now, log to console
    // In production, could store in database or external logging service
    console.log('[AUDIT]', JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry,
    }));
  } catch (error) {
    console.error('Failed to create audit trail:', error);
  }
}

/**
 * Log user action
 */
export async function logUserAction(
  userId: string,
  userEmail: string,
  action: string,
  details?: Record<string, unknown>
): Promise<void> {
  await createAuditTrail({
    userId,
    userEmail,
    action,
    entity: 'user',
    entityId: userId,
    details,
  });
}

/**
 * Log entity change
 */
export async function logEntityChange(
  userId: string,
  userEmail: string,
  entity: string,
  entityId: string,
  action: 'create' | 'update' | 'delete',
  changes?: Record<string, unknown>
): Promise<void> {
  await createAuditTrail({
    userId,
    userEmail,
    action: `${action}_${entity}`,
    entity,
    entityId,
    details: changes,
  });
}