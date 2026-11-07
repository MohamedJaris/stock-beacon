import { IDatabaseAdapter } from '../DatabaseAdapter';

export interface MigrationDefinition {
  version: number;
  name: string;
  upSql: string;
}

export const MIGRATIONS: MigrationDefinition[] = [
  {
    version: 1,
    name: '001_initial_inventory_schema',
    upSql: `
      CREATE TABLE IF NOT EXISTS business_profiles (
        id TEXT PRIMARY KEY NOT NULL,
        business_name TEXT NOT NULL,
        business_type TEXT NOT NULL,
        owner_name TEXT,
        contact_number TEXT,
        business_address TEXT,
        country TEXT NOT NULL DEFAULT 'India',
        date_format TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
        timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
        default_unit_id TEXT,
        app_lock_enabled INTEGER NOT NULL DEFAULT 0,
        app_lock_pin TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS warehouses (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        address TEXT,
        is_primary INTEGER NOT NULL DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES business_profiles(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        parent_id TEXT,
        description TEXT,
        color_hex TEXT NOT NULL DEFAULT '#2563EB',
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES business_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS units_of_measure (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        symbol TEXT NOT NULL,
        allow_fractional INTEGER NOT NULL DEFAULT 0,
        is_custom INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES business_profiles(id) ON DELETE CASCADE,
        UNIQUE(workspace_id, symbol)
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        contact_number TEXT,
        email TEXT,
        address TEXT,
        notes TEXT,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES business_profiles(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sku TEXT NOT NULL,
        barcode TEXT,
        category_id TEXT NOT NULL,
        subcategory_id TEXT,
        description TEXT,
        unit_id TEXT NOT NULL,
        min_stock_threshold REAL NOT NULL DEFAULT 0,
        reorder_quantity REAL,
        supplier_id TEXT,
        image_uri TEXT,
        has_variants INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES business_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id),
        FOREIGN KEY (subcategory_id) REFERENCES categories(id),
        FOREIGN KEY (unit_id) REFERENCES units_of_measure(id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
        UNIQUE(workspace_id, sku)
      );

      CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(workspace_id, barcode);
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(workspace_id, category_id, is_archived);

      CREATE TABLE IF NOT EXISTS product_attributes (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        attribute_name TEXT NOT NULL,
        attribute_options_json TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES business_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS product_variants (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        variant_name TEXT NOT NULL,
        attribute_values_json TEXT NOT NULL,
        sku TEXT NOT NULL,
        barcode TEXT,
        min_stock_threshold REAL NOT NULL DEFAULT 0,
        reorder_quantity REAL,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES business_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        UNIQUE(workspace_id, sku)
      );

      CREATE INDEX IF NOT EXISTS idx_variants_barcode ON product_variants(workspace_id, barcode);
      CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id, is_archived);

      CREATE TABLE IF NOT EXISTS stock_events (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        warehouse_id TEXT,
        item_key TEXT NOT NULL,
        product_id TEXT NOT NULL,
        variant_id TEXT,
        event_type TEXT NOT NULL CHECK(event_type IN ('OPENING_STOCK', 'STOCK_INWARD', 'PHYSICAL_COUNT', 'STOCK_ADJUSTMENT')),
        quantity REAL NOT NULL,
        previous_balance REAL,
        resulting_balance REAL NOT NULL,
        variance_quantity REAL,
        event_date TEXT NOT NULL,
        event_timestamp TEXT NOT NULL,
        sequence_no INTEGER NOT NULL,
        supplier_id TEXT,
        reference_number TEXT,
        reason TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES business_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (variant_id) REFERENCES product_variants(id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_stock_events_item_date ON stock_events(workspace_id, item_key, event_date, sequence_no);
      CREATE INDEX IF NOT EXISTS idx_stock_events_date ON stock_events(workspace_id, event_date, event_type);

      CREATE TABLE IF NOT EXISTS inventory_balances (
        item_key TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        variant_id TEXT,
        recorded_quantity REAL,
        min_stock_threshold REAL NOT NULL DEFAULT 0,
        stock_status TEXT NOT NULL CHECK(stock_status IN ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'UNKNOWN')),
        quantity_provenance TEXT NOT NULL CHECK(quantity_provenance IN ('PHYSICAL_COUNT', 'CALCULATED_INWARD_ONLY', 'CARRIED_FORWARD', 'UNKNOWN')),
        last_physical_count_date TEXT,
        last_physical_count_qty REAL,
        last_inward_date TEXT,
        last_event_id TEXT,
        active_alert_state TEXT NOT NULL DEFAULT 'NONE' CHECK(active_alert_state IN ('NONE', 'LOW_STOCK_ALERTED', 'OUT_OF_STOCK_ALERTED')),
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES business_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_balances_status ON inventory_balances(workspace_id, stock_status);

      CREATE TABLE IF NOT EXISTS product_threshold_history (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        item_key TEXT NOT NULL,
        product_id TEXT NOT NULL,
        variant_id TEXT,
        min_stock_threshold REAL NOT NULL,
        effective_from_date TEXT NOT NULL,
        effective_timestamp TEXT NOT NULL,
        sequence_no INTEGER NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES business_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_threshold_history_lookup ON product_threshold_history(workspace_id, item_key, effective_from_date, sequence_no);

      CREATE TABLE IF NOT EXISTS daily_inventory_snapshots (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        item_key TEXT NOT NULL,
        product_id TEXT NOT NULL,
        variant_id TEXT,
        snapshot_date TEXT NOT NULL,
        recorded_quantity REAL,
        min_stock_threshold REAL NOT NULL,
        stock_status TEXT NOT NULL CHECK(stock_status IN ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'UNKNOWN')),
        quantity_source TEXT NOT NULL CHECK(quantity_source IN ('PHYSICAL_COUNT', 'CALCULATED_INWARD_ONLY', 'CARRIED_FORWARD', 'UNKNOWN')),
        last_physical_count_date TEXT,
        generated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES business_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
        UNIQUE(workspace_id, item_key, snapshot_date)
      );

      CREATE INDEX IF NOT EXISTS idx_snapshots_date_status ON daily_inventory_snapshots(workspace_id, snapshot_date, stock_status);
      CREATE INDEX IF NOT EXISTS idx_snapshots_item_date ON daily_inventory_snapshots(workspace_id, item_key, snapshot_date);

      CREATE TABLE IF NOT EXISTS notification_settings (
        workspace_id TEXT PRIMARY KEY NOT NULL,
        low_stock_alerts_enabled INTEGER NOT NULL DEFAULT 1,
        out_of_stock_alerts_enabled INTEGER NOT NULL DEFAULT 1,
        daily_reminder_enabled INTEGER NOT NULL DEFAULT 1,
        daily_reminder_time TEXT NOT NULL DEFAULT '20:00',
        daily_summary_enabled INTEGER NOT NULL DEFAULT 1,
        daily_summary_time TEXT NOT NULL DEFAULT '09:00',
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES business_profiles(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        item_key TEXT,
        product_id TEXT,
        variant_id TEXT,
        notification_type TEXT NOT NULL CHECK(notification_type IN ('LOW_STOCK_ALERT', 'OUT_OF_STOCK_ALERT', 'DAILY_COUNT_REMINDER', 'DAILY_LOW_STOCK_SUMMARY', 'SYSTEM_BACKUP')),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES business_profiles(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(workspace_id, is_read, created_at);

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES business_profiles(id) ON DELETE CASCADE
      );
    `,
  },
];

export async function runDatabaseMigrations(db: IDatabaseAdapter): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = await db.getAllAsync<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version ASC'
  );
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  for (const migration of MIGRATIONS) {
    if (!appliedVersions.has(migration.version)) {
      await db.withTransactionAsync(async () => {
        await db.execAsync(migration.upSql);
        await db.runAsync(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
          [migration.version, migration.name, new Date().toISOString()]
        );
      });
    }
  }
}
