import { generateId } from '@/core/utils/skuGenerator';
import {
  AppNotification,
  AuditLog,
  BusinessProfile,
  NotificationSettings,
} from '@/domain/entities';
import { DateFormatOption, NotificationType } from '@/domain/enums';
import { IDatabaseAdapter } from '../database/DatabaseAdapter';
import {
  DEFAULT_UNITS_OF_MEASURE,
  getSuggestedCategoriesForBusinessType,
} from '../database/seed/defaultSeed';

export interface CreateBusinessProfileInput {
  businessName: string;
  businessType: string;
  ownerName?: string | null;
  contactNumber?: string | null;
  businessAddress?: string | null;
  country: string;
  dateFormat: DateFormatOption;
  timezone: string;
  defaultUnitSymbol?: string;
}

export class SqliteWorkspaceRepository {
  constructor(private readonly db: IDatabaseAdapter) {}

  async getActiveProfile(): Promise<BusinessProfile | null> {
    const row = await this.db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM business_profiles ORDER BY created_at ASC LIMIT 1'
    );
    if (!row) return null;
    return this.mapBusinessProfile(row);
  }

  async createProfileWithDefaults(
    input: CreateBusinessProfileInput
  ): Promise<BusinessProfile> {
    const now = new Date().toISOString();
    const workspaceId = generateId();
    const warehouseId = generateId();

    return await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `INSERT INTO business_profiles (
          id, business_name, business_type, owner_name, contact_number,
          business_address, country, date_format, timezone, default_unit_id,
          app_lock_enabled, app_lock_pin, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, ?, ?)`,
        [
          workspaceId,
          input.businessName.trim(),
          input.businessType.trim(),
          input.ownerName?.trim() || null,
          input.contactNumber?.trim() || null,
          input.businessAddress?.trim() || null,
          input.country.trim(),
          input.dateFormat,
          input.timezone.trim(),
          now,
          now,
        ]
      );

      // Primary Warehouse (future-ready)
      await this.db.runAsync(
        `INSERT INTO warehouses (
          id, workspace_id, name, code, address, is_primary, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)`,
        [
          warehouseId,
          workspaceId,
          'Main Store / Warehouse',
          'MAIN-01',
          input.businessAddress?.trim() || null,
          now,
          now,
        ]
      );

      // Seed default Units of Measure
      let selectedDefaultUnitId: string | null = null;
      const targetSymbol = input.defaultUnitSymbol || 'pcs';

      for (const u of DEFAULT_UNITS_OF_MEASURE) {
        const unitId = generateId();
        if (u.symbol === targetSymbol || !selectedDefaultUnitId) {
          if (u.symbol === targetSymbol) {
            selectedDefaultUnitId = unitId;
          } else if (!selectedDefaultUnitId) {
            selectedDefaultUnitId = unitId;
          }
        }
        await this.db.runAsync(
          `INSERT INTO units_of_measure (
            id, workspace_id, name, symbol, allow_fractional, is_custom, is_archived, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
          [
            unitId,
            workspaceId,
            u.name,
            u.symbol,
            u.allowFractional ? 1 : 0,
            now,
            now,
          ]
        );
      }

      if (selectedDefaultUnitId) {
        await this.db.runAsync(
          'UPDATE business_profiles SET default_unit_id = ? WHERE id = ?',
          [selectedDefaultUnitId, workspaceId]
        );
      }

      // Seed starter categories tailored to the selected business type
      const starterCategories = getSuggestedCategoriesForBusinessType(
        input.businessType
      );
      for (const cat of starterCategories) {
        await this.db.runAsync(
          `INSERT INTO categories (
            id, workspace_id, name, parent_id, description, color_hex, is_archived, created_at, updated_at
          ) VALUES (?, ?, ?, NULL, ?, ?, 0, ?, ?)`,
          [
            generateId(),
            workspaceId,
            cat.name,
            cat.description,
            cat.colorHex,
            now,
            now,
          ]
        );
      }

      // Default Notification Settings
      await this.db.runAsync(
        `INSERT INTO notification_settings (
          workspace_id, low_stock_alerts_enabled, out_of_stock_alerts_enabled,
          daily_reminder_enabled, daily_reminder_time, daily_summary_enabled,
          daily_summary_time, updated_at
        ) VALUES (?, 1, 1, 1, '20:00', 1, '09:00', ?)`,
        [workspaceId, now]
      );

      // Audit Log
      await this.recordAuditLog({
        workspaceId,
        actionType: 'BUSINESS_ONBOARDED',
        entityType: 'BUSINESS_PROFILE',
        entityId: workspaceId,
        summary: `Created business profile "${input.businessName.trim()}" (${input.businessType})`,
      });

      const created = await this.getActiveProfile();
      if (!created) {
        throw new Error('Failed to load created business profile.');
      }
      return created;
    });
  }

  async updateProfile(
    workspaceId: string,
    updates: Partial<
      Pick<
        BusinessProfile,
        | 'businessName'
        | 'businessType'
        | 'ownerName'
        | 'contactNumber'
        | 'businessAddress'
        | 'country'
        | 'dateFormat'
        | 'timezone'
        | 'defaultUnitId'
        | 'appLockEnabled'
        | 'appLockPin'
      >
    >
  ): Promise<BusinessProfile> {
    const existing = await this.getActiveProfile();
    if (!existing || existing.id !== workspaceId) {
      throw new Error('Business profile not found.');
    }
    const now = new Date().toISOString();

    await this.db.runAsync(
      `UPDATE business_profiles SET
        business_name = ?,
        business_type = ?,
        owner_name = ?,
        contact_number = ?,
        business_address = ?,
        country = ?,
        date_format = ?,
        timezone = ?,
        default_unit_id = ?,
        app_lock_enabled = ?,
        app_lock_pin = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        updates.businessName?.trim() ?? existing.businessName,
        updates.businessType?.trim() ?? existing.businessType,
        updates.ownerName !== undefined ? updates.ownerName : existing.ownerName,
        updates.contactNumber !== undefined
          ? updates.contactNumber
          : existing.contactNumber,
        updates.businessAddress !== undefined
          ? updates.businessAddress
          : existing.businessAddress,
        updates.country?.trim() ?? existing.country,
        updates.dateFormat ?? existing.dateFormat,
        updates.timezone?.trim() ?? existing.timezone,
        updates.defaultUnitId !== undefined
          ? updates.defaultUnitId
          : existing.defaultUnitId,
        (updates.appLockEnabled ?? existing.appLockEnabled) ? 1 : 0,
        updates.appLockPin !== undefined ? updates.appLockPin : existing.appLockPin,
        now,
        workspaceId,
      ]
    );

    const updated = await this.getActiveProfile();
    if (!updated) throw new Error('Profile missing after update');
    return updated;
  }

  async getNotificationSettings(workspaceId: string): Promise<NotificationSettings> {
    const row = await this.db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM notification_settings WHERE workspace_id = ?',
      [workspaceId]
    );
    if (!row) {
      const now = new Date().toISOString();
      await this.db.runAsync(
        `INSERT INTO notification_settings (
          workspace_id, low_stock_alerts_enabled, out_of_stock_alerts_enabled,
          daily_reminder_enabled, daily_reminder_time, daily_summary_enabled,
          daily_summary_time, updated_at
        ) VALUES (?, 1, 1, 1, '20:00', 1, '09:00', ?)`,
        [workspaceId, now]
      );
      return {
        workspaceId,
        lowStockAlertsEnabled: true,
        outOfStockAlertsEnabled: true,
        dailyReminderEnabled: true,
        dailyReminderTime: '20:00',
        dailySummaryEnabled: true,
        dailySummaryTime: '09:00',
        updatedAt: now,
      };
    }

    return {
      workspaceId: String(row.workspace_id),
      lowStockAlertsEnabled: Boolean(row.low_stock_alerts_enabled),
      outOfStockAlertsEnabled: Boolean(row.out_of_stock_alerts_enabled),
      dailyReminderEnabled: Boolean(row.daily_reminder_enabled),
      dailyReminderTime: String(row.daily_reminder_time),
      dailySummaryEnabled: Boolean(row.daily_summary_enabled),
      dailySummaryTime: String(row.daily_summary_time),
      updatedAt: String(row.updated_at),
    };
  }

  async updateNotificationSettings(
    workspaceId: string,
    updates: Partial<Omit<NotificationSettings, 'workspaceId' | 'updatedAt'>>
  ): Promise<NotificationSettings> {
    const current = await this.getNotificationSettings(workspaceId);
    const now = new Date().toISOString();

    await this.db.runAsync(
      `UPDATE notification_settings SET
        low_stock_alerts_enabled = ?,
        out_of_stock_alerts_enabled = ?,
        daily_reminder_enabled = ?,
        daily_reminder_time = ?,
        daily_summary_enabled = ?,
        daily_summary_time = ?,
        updated_at = ?
      WHERE workspace_id = ?`,
      [
        (updates.lowStockAlertsEnabled ?? current.lowStockAlertsEnabled) ? 1 : 0,
        (updates.outOfStockAlertsEnabled ?? current.outOfStockAlertsEnabled) ? 1 : 0,
        (updates.dailyReminderEnabled ?? current.dailyReminderEnabled) ? 1 : 0,
        updates.dailyReminderTime ?? current.dailyReminderTime,
        (updates.dailySummaryEnabled ?? current.dailySummaryEnabled) ? 1 : 0,
        updates.dailySummaryTime ?? current.dailySummaryTime,
        now,
        workspaceId,
      ]
    );

    return await this.getNotificationSettings(workspaceId);
  }

  async listNotifications(
    workspaceId: string,
    limit = 100
  ): Promise<AppNotification[]> {
    const rows = await this.db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM notifications
       WHERE workspace_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [workspaceId, limit]
    );

    return rows.map((r) => ({
      id: String(r.id),
      workspaceId: String(r.workspace_id),
      itemKey: r.item_key ? String(r.item_key) : null,
      productId: r.product_id ? String(r.product_id) : null,
      variantId: r.variant_id ? String(r.variant_id) : null,
      notificationType: r.notification_type as NotificationType,
      title: String(r.title),
      message: String(r.message),
      isRead: Boolean(r.is_read),
      createdAt: String(r.created_at),
    }));
  }

  async createNotification(params: {
    workspaceId: string;
    itemKey?: string | null;
    productId?: string | null;
    variantId?: string | null;
    notificationType: NotificationType;
    title: string;
    message: string;
  }): Promise<AppNotification> {
    const id = generateId();
    const now = new Date().toISOString();

    await this.db.runAsync(
      `INSERT INTO notifications (
        id, workspace_id, item_key, product_id, variant_id,
        notification_type, title, message, is_read, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        id,
        params.workspaceId,
        params.itemKey ?? null,
        params.productId ?? null,
        params.variantId ?? null,
        params.notificationType,
        params.title,
        params.message,
        now,
      ]
    );

    return {
      id,
      workspaceId: params.workspaceId,
      itemKey: params.itemKey ?? null,
      productId: params.productId ?? null,
      variantId: params.variantId ?? null,
      notificationType: params.notificationType,
      title: params.title,
      message: params.message,
      isRead: false,
      createdAt: now,
    };
  }

  async markAllNotificationsRead(workspaceId: string): Promise<void> {
    await this.db.runAsync(
      'UPDATE notifications SET is_read = 1 WHERE workspace_id = ?',
      [workspaceId]
    );
  }

  async markNotificationRead(id: string): Promise<void> {
    await this.db.runAsync('UPDATE notifications SET is_read = 1 WHERE id = ?', [
      id,
    ]);
  }

  async recordAuditLog(params: {
    workspaceId: string;
    actionType: string;
    entityType: string;
    entityId: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO audit_logs (
        id, workspace_id, action_type, entity_type, entity_id, summary, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        generateId(),
        params.workspaceId,
        params.actionType,
        params.entityType,
        params.entityId,
        params.summary,
        params.metadata ? JSON.stringify(params.metadata) : null,
        new Date().toISOString(),
      ]
    );
  }

  async listAuditLogs(workspaceId: string, limit = 100): Promise<AuditLog[]> {
    const rows = await this.db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM audit_logs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?`,
      [workspaceId, limit]
    );
    return rows.map((r) => ({
      id: String(r.id),
      workspaceId: String(r.workspace_id),
      actionType: String(r.action_type),
      entityType: String(r.entity_type),
      entityId: String(r.entity_id),
      summary: String(r.summary),
      metadataJson: r.metadata_json ? String(r.metadata_json) : null,
      createdAt: String(r.created_at),
    }));
  }

  private mapBusinessProfile(row: Record<string, unknown>): BusinessProfile {
    return {
      id: String(row.id),
      businessName: String(row.business_name),
      businessType: String(row.business_type),
      ownerName: row.owner_name ? String(row.owner_name) : null,
      contactNumber: row.contact_number ? String(row.contact_number) : null,
      businessAddress: row.business_address ? String(row.business_address) : null,
      country: String(row.country),
      dateFormat: (row.date_format as DateFormatOption) || 'DD/MM/YYYY',
      timezone: String(row.timezone || 'Asia/Kolkata'),
      defaultUnitId: row.default_unit_id ? String(row.default_unit_id) : null,
      appLockEnabled: Boolean(row.app_lock_enabled),
      appLockPin: row.app_lock_pin ? String(row.app_lock_pin) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}
