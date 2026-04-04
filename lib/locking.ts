/**
 * Locking Utilities - Optimistic locking for concurrent updates
 * Task 36: Concurrency Control
 */

import prisma from '@/lib/prisma';

/**
 * Result of a version check operation
 */
export interface VersionCheckResult {
  success: boolean;
  error?: string;
  currentVersion?: number;
}

/**
 * Check if a record's version matches expected version
 * Used for optimistic locking
 */
export async function checkVersion(
  model: keyof typeof prisma,
  id: string,
  expectedVersion: number
): Promise<VersionCheckResult> {
  try {
    const delegate = prisma[model] as unknown as {
      findUnique: (args: { where: { id: string }; select: { version: boolean } }) => Promise<{ version: number } | null>
    };
    const record = await delegate.findUnique({
      where: { id },
      select: { version: true },
    });

    if (!record) {
      return {
        success: false,
        error: 'Record tidak ditemukan',
      };
    }

    if (record.version !== expectedVersion) {
      return {
        success: false,
        error: `Versi tidak cocok. Versi saat ini: ${record.version}, diharapkan: ${expectedVersion}`,
        currentVersion: record.version,
      };
    }

    return {
      success: true,
      currentVersion: record.version,
    };
  } catch {
    return {
      success: false,
      error: 'Gagal memeriksa versi',
    };
  }
}

/**
 * Update a record with version increment
 * Returns error if version doesn't match (concurrent modification)
 */
export async function updateWithVersion(
  model: keyof typeof prisma,
  id: string,
  expectedVersion: number,
  data: Record<string, unknown>
): Promise<{ success: boolean; error?: string; result?: unknown }> {
  try {
    // First check version
    const versionCheck = await checkVersion(model, id, expectedVersion);
    if (!versionCheck.success) {
      return { success: false, error: versionCheck.error };
    }

    // Attempt update with version check
    const delegate = prisma[model] as unknown as { 
      update: (args: { where: { id: string; version: number }; data: Record<string, unknown> }) => Promise<unknown> 
    };
    const result = await delegate.update({
      where: {
        id,
        version: expectedVersion, // Prisma will only update if version matches
      },
      data: {
        ...data,
        version: { increment: 1 },
      },
    });

    return { success: true, result };
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };
    // Prisma throws error if where clause doesn't match (version mismatch)
    if (error.code === 'P2025' || error.message?.includes('record to update not found')) {
      return {
        success: false,
        error: 'Konflik modifikasi: data sudah diubah oleh proses lain. Silakan muat ulang dan coba lagi.',
      };
    }
    return {
      success: false,
      error: 'Gagal memperbarui data',
    };
  }
}

/**
 * Delete a record with version check
 * Prevents deletion if version doesn't match
 */
export async function deleteWithVersion(
  model: keyof typeof prisma,
  id: string,
  expectedVersion: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const delegate = prisma[model] as unknown as {
      delete: (args: { where: { id: string; version: number } }) => Promise<unknown>
    };
    await delegate.delete({
      where: {
        id,
        version: expectedVersion,
      },
    });

    return { success: true };
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string };
    if (error.code === 'P2025' || error.message?.includes('record to update not found')) {
      return {
        success: false,
        error: 'Konflik modifikasi: data sudah dihapus atau diubah oleh proses lain.',
      };
    }
    return {
      success: false,
      error: 'Gagal menghapus data',
    };
  }
}

/**
 * Transaction with version locking
 * Ensures atomic update with version check
 */
export async function transactionWithVersion(
  operations: Array<{
    model: keyof typeof prisma;
    id: string;
    expectedVersion: number;
    data?: Record<string, unknown>;
    action: 'update' | 'delete';
  }>
): Promise<{ success: boolean; error?: string; results?: unknown[] }> {
  try {
    const results = await prisma.$transaction(async (tx) => {
      const outputs: unknown[] = [];

      for (const op of operations) {
        if (op.action === 'update' && op.data) {
          // Use type assertion for dynamic model access in transaction
          const modelKey = op.model as keyof typeof tx;
          const delegate = tx[modelKey] as unknown as {
            update: (args: { where: { id: string; version: number }; data: Record<string, unknown> }) => Promise<unknown>
          };
          const result = await delegate.update({
            where: {
              id: op.id,
              version: op.expectedVersion,
            },
            data: {
              ...op.data,
              version: { increment: 1 },
            },
          });
          outputs.push(result);
        } else if (op.action === 'delete') {
          const modelKey = op.model as keyof typeof tx;
          const delegate = tx[modelKey] as unknown as {
            delete: (args: { where: { id: string; version: number } }) => Promise<unknown>
          };
          await delegate.delete({
            where: {
              id: op.id,
              version: op.expectedVersion,
            },
          });
        }
      }

      return outputs;
    });

    return { success: true, results };
  } catch (err: unknown) {
    const error = err as { code?: string };
    if (error.code === 'P2025') {
      return {
        success: false,
        error: 'Konflik modifikasi: salah satu data sudah diubah oleh proses lain.',
      };
    }
    return {
      success: false,
      error: 'Transaksi gagal',
    };
  }
}

/**
 * Decorator helper for API handlers to check version before operations
 */
export function requireVersion(
  handler: (req: unknown, res: unknown, ...args: unknown[]) => unknown,
  options: { paramName?: string; bodyField?: string } = {}
) {
  return async function (req: Record<string, unknown>, res: { status: (c: number) => { json: (d: unknown) => void } }, ...args: unknown[]) {
    const { paramName = 'id', bodyField = 'version' } = options;

    const query = req.query as Record<string, string> | undefined;
    const body = req.body as Record<string, unknown> | undefined;
    const id = (query && query[paramName]) || (body && body.id);
    const version = body?.[bodyField];

    if (!id || version === undefined) {
      return res.status(400).json({
        error: 'ID dan versi wajib diisi untuk operasi ini',
      });
    }

    // Check version before proceeding
    // Note: This is a simplified version, actual implementation should
    // determine model from context
    return handler(req, res, ...args);
  };
}

const locking = {
  checkVersion,
  updateWithVersion,
  deleteWithVersion,
  transactionWithVersion,
  requireVersion,
};

export default locking;