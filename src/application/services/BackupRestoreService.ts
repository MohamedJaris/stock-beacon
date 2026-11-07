import { computeChecksum, generateId } from '@/core/utils/skuGenerator';
import { IDatabaseAdapter } from '@/data/database/DatabaseAdapter';
import { z } from 'zod';

export const BACKUP_FORMAT_MAGIC = 'STOCK_BEACON_BACKUP';
export const CURRENT_BACKUP_SCHEMA_VERSION = 1;

export interface BackupTablesPayload {
  business_profiles: Record<string, unknown>[];
  warehouses: Record<string, unknown>[];
  categories: Record<string, unknown>[];
  units_of_measure: Record<string, unknown>[];
  suppliers: Record<string, unknown>[];
  products: Record<string, unknown>[];
  product_attributes: Record<string, unknown>[];
  product_variants: Record<string, unknown>[];
  stock_events: Record<string, unknown>[];
  inventory_balances: Record<string, unknown>[];
  product_threshold_history: Record<string, unknown>[];
  daily_inventory_snapshots: Record<string, unknown>[];
  notification_settings: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  audit_logs: Record<string, unknown>[];
}

export interface BackupBundle {
  format: typeof BACKUP_FORMAT_MAGIC;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  workspaceId: string;
  businessName: string;
  checksum: string;
  tables: BackupTablesPayload;
}

export interface BackupValidationResult {
  isValid: boolean;
  error: string | null;
  bundle: BackupBundle | null;
  summary: {
    businessName: string;
    exportedAt: string;
    schemaVersion: number;
    productsCount: number;
    variantsCount: number;
    stockEventsCount: number;
    categoriesCount: number;
  } | null;
}

const backupEnvelopeSchema = z.object({
  format: z.literal(BACKUP_FORMAT_MAGIC),
  schemaVersion: z.number().int().min(1).max(CURRENT_BACKUP_SCHEMA_VERSION),
  appVersion: z.string(),
  exportedAt: z.string(),
  workspaceId: z.string().min(1),
  businessName: z.string().min(1),
  checksum: z.string().min(4),
  tables: z.object({
    business_profiles: z.array(z.record(z.unknown())).min(1),
    warehouses: z.array(z.record(z.unknown())),
    categories: z.array(z.record(z.unknown())),
    units_of_measure: z.array(z.record(z.unknown())),
    suppliers: z.array(z.record(z.unknown())),
    products: z.array(z.record(z.unknown())),
    product_attributes: z.array(z.record(z.unknown())),
    product_variants: z.array(z.record(z.unknown())),
    stock_events: z.array(z.record(z.unknown())),
    inventory_balances: z.array(z.record(z.unknown())),
    product_threshold_history: z.array(z.record(z.unknown())),
    daily_inventory_snapshots: z.array(z.record(z.unknown())),
    notification_settings: z.array(z.record(z.unknown())),
    notifications: z.array(z.record(z.unknown())),
    audit_logs: z.array(z.record(z.unknown())),
  }),
});

export class BackupRestoreService {
  constructor(private readonly db: IDatabaseAdapter) {}

  async createBackupBundle(workspaceId: string): Promise<BackupBundle> {
    const profile = await this.db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM business_profiles WHERE id = ?',
      [workspaceId]
    );
    if (!profile) {
      throw new Error('Active business profile not found for backup.');
    }

    const tables: BackupTablesPayload = {
      business_profiles: await this.db.getAllAsync(
        'SELECT * FROM business_profiles WHERE id = ?',
        [workspaceId]
      ),
      warehouses: await this.db.getAllAsync(
        'SELECT * FROM warehouses WHERE workspace_id = ?',
        [workspaceId]
      ),
      categories: await this.db.getAllAsync(
        'SELECT * FROM categories WHERE workspace_id = ?',
        [workspaceId]
      ),
      units_of_measure: await this.db.getAllAsync(
        'SELECT * FROM units_of_measure WHERE workspace_id = ?',
        [workspaceId]
      ),
      suppliers: await this.db.getAllAsync(
        'SELECT * FROM suppliers WHERE workspace_id = ?',
        [workspaceId]
      ),
      products: await this.db.getAllAsync(
        'SELECT * FROM products WHERE workspace_id = ?',
        [workspaceId]
      ),
      product_attributes: await this.db.getAllAsync(
        'SELECT * FROM product_attributes WHERE workspace_id = ?',
        [workspaceId]
      ),
      product_variants: await this.db.getAllAsync(
        'SELECT * FROM product_variants WHERE workspace_id = ?',
        [workspaceId]
      ),
      stock_events: await this.db.getAllAsync(
        'SELECT * FROM stock_events WHERE workspace_id = ? ORDER BY sequence_no ASC',
        [workspaceId]
      ),
      inventory_balances: await this.db.getAllAsync(
        'SELECT * FROM inventory_balances WHERE workspace_id = ?',
        [workspaceId]
      ),
      product_threshold_history: await this.db.getAllAsync(
        'SELECT * FROM product_threshold_history WHERE workspace_id = ? ORDER BY sequence_no ASC',
        [workspaceId]
      ),
      daily_inventory_snapshots: await this.db.getAllAsync(
        'SELECT * FROM daily_inventory_snapshots WHERE workspace_id = ? ORDER BY snapshot_date ASC',
        [workspaceId]
      ),
      notification_settings: await this.db.getAllAsync(
        'SELECT * FROM notification_settings WHERE workspace_id = ?',
        [workspaceId]
      ),
      notifications: await this.db.getAllAsync(
        'SELECT * FROM notifications WHERE workspace_id = ?',
        [workspaceId]
      ),
      audit_logs: await this.db.getAllAsync(
        'SELECT * FROM audit_logs WHERE workspace_id = ?',
        [workspaceId]
      ),
    };

    const tablesSerialized = JSON.stringify(tables);
    const checksum = computeChecksum(tablesSerialized);

    return {
      format: BACKUP_FORMAT_MAGIC,
      schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
      appVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      workspaceId,
      businessName: String(profile.business_name),
      checksum,
      tables,
    };
  }

  validateBackupJson(jsonContent: string): BackupValidationResult {
    try {
      const parsed = JSON.parse(jsonContent);
      const result = backupEnvelopeSchema.safeParse(parsed);
      if (!result.success) {
        return {
          isValid: false,
          error: `Invalid backup structure: ${result.error.issues[0]?.message ?? 'Malformed schema'}`,
          bundle: null,
          summary: null,
        };
      }

      const bundle = result.data as unknown as BackupBundle;
      const expectedChecksum = computeChecksum(JSON.stringify(bundle.tables));
      if (bundle.checksum !== expectedChecksum) {
        return {
          isValid: false,
          error:
            'Backup integrity check failed: checksum mismatch (file appears modified or corrupted).',
          bundle: null,
          summary: null,
        };
      }

      return {
        isValid: true,
        error: null,
        bundle,
        summary: {
          businessName: bundle.businessName,
          exportedAt: bundle.exportedAt,
          schemaVersion: bundle.schemaVersion,
          productsCount: bundle.tables.products.length,
          variantsCount: bundle.tables.product_variants.length,
          stockEventsCount: bundle.tables.stock_events.length,
          categoriesCount: bundle.tables.categories.length,
        },
      };
    } catch (err) {
      return {
        isValid: false,
        error: `Corrupted JSON backup file: ${(err as Error).message}`,
        bundle: null,
        summary: null,
      };
    }
  }

  /**
   * Validates and atomically restores a backup bundle into SQLite.
   * If any step fails, the transaction rolls back completely, preserving existing data.
   */
  async restoreFromJson(jsonContent: string): Promise<BackupBundle> {
    const validation = this.validateBackupJson(jsonContent);
    if (!validation.isValid || !validation.bundle) {
      throw new Error(validation.error || 'Invalid backup file.');
    }

    const bundle = validation.bundle;

    await this.db.withTransactionAsync(async () => {
      // Clear current data in child-to-parent order
      const deleteOrder = [
        'audit_logs',
        'notifications',
        'notification_settings',
        'daily_inventory_snapshots',
        'product_threshold_history',
        'inventory_balances',
        'stock_events',
        'product_variants',
        'product_attributes',
        'products',
        'suppliers',
        'units_of_measure',
        'categories',
        'warehouses',
        'business_profiles',
      ];

      for (const table of deleteOrder) {
        await this.db.runAsync(`DELETE FROM ${table}`);
      }

      // Insert in parent-to-child order
      const insertOrder: (keyof BackupTablesPayload)[] = [
        'business_profiles',
        'warehouses',
        'categories',
        'units_of_measure',
        'suppliers',
        'products',
        'product_attributes',
        'product_variants',
        'stock_events',
        'inventory_balances',
        'product_threshold_history',
        'daily_inventory_snapshots',
        'notification_settings',
        'notifications',
        'audit_logs',
      ];

      for (const table of insertOrder) {
        const rows = bundle.tables[table];
        for (const row of rows) {
          const cols = Object.keys(row);
          if (cols.length === 0) continue;
          const placeholders = cols.map(() => '?').join(', ');
          const values = cols.map((k) => {
            const v = row[k];
            if (v === undefined || v === null) return null;
            if (typeof v === 'boolean') return v ? 1 : 0;
            if (typeof v === 'number' || typeof v === 'string') return v;
            return JSON.stringify(v);
          });
          await this.db.runAsync(
            `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
            values
          );
        }
      }

      await this.db.runAsync(
        `INSERT INTO audit_logs (
          id, workspace_id, action_type, entity_type, entity_id, summary, metadata_json, created_at
        ) VALUES (?, ?, 'BACKUP_RESTORED', 'WORKSPACE', ?, ?, NULL, ?)`,
        [
          generateId(),
          bundle.workspaceId,
          bundle.workspaceId,
          `Restored backup from ${bundle.exportedAt}`,
          new Date().toISOString(),
        ]
      );
    });

    return bundle;
  }
}
