# Database Schema Specification
# StockBeacon — Normalised SQLite Schema (Version 1)

---

## 1. Overview & Conventions

- **Engine**: SQLite via `expo-sqlite` (`PRAGMA foreign_keys = ON;`, `PRAGMA journal_mode = WAL;`).
- **Primary Keys**: UUID v4 strings (`TEXT PRIMARY KEY NOT NULL`).
- **Workspace Isolation**: All domain tables include `workspace_id TEXT NOT NULL` referencing `business_profiles(id)` to support future multi-business and cloud-sync capabilities.
- **Inventory Item Target**: Stock can be tracked at the **Product level** (for standard products without variants) or at the **Product Variant level** (when `has_variants = 1`).
  - In `stock_events`, `inventory_balances`, `product_threshold_history`, and `daily_inventory_snapshots`, `product_id` is always populated, and `variant_id` is `NULL` for base products or set to `product_variants.id` for variant items. A computed `item_key` (`COALESCE(variant_id, product_id)`) uniquely identifies each trackable SKU.
- **Date & Time Representation**:
  - `event_date` / `snapshot_date` / `effective_date`: Stored as explicit business-local calendar date strings in ISO `YYYY-MM-DD` format for deterministic daily boundary queries.
  - `event_timestamp` / `created_at` / `updated_at`: Stored as ISO-8601 timestamps (`YYYY-MM-DDTHH:mm:ss.sssZ`).

---

## 2. Table Definitions

### 2.1 `schema_migrations`
Tracks applied database schema versions.
```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
```

### 2.2 `business_profiles`
Stores the local business workspace configuration.
```sql
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
```

### 2.3 `warehouses` (Future-Ready)
Default primary location created automatically during onboarding.
```sql
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
```

### 2.4 `categories`
Supports top-level categories and optional subcategories (`parent_id`).
```sql
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
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL,
  UNIQUE(workspace_id, name, parent_id)
);
```

### 2.5 `units_of_measure`
Configurable units of measurement (`pcs`, `kg`, `m`, `packs`, etc.).
```sql
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
```

### 2.6 `suppliers`
Optional supplier directory.
```sql
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
```

### 2.7 `products`
Master product catalog. Products with transaction history are never hard-deleted (`is_archived = 1`).
```sql
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
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(workspace_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_category ON products(workspace_id, category_id, is_archived);
```

### 2.8 `product_attributes`
Configurable variant attribute definitions per product (e.g., `Size`, `Colour`).
```sql
CREATE TABLE IF NOT EXISTS product_attributes (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  attribute_name TEXT NOT NULL,
  attribute_options_json TEXT NOT NULL, -- JSON array e.g. '["Small","Medium","Large"]'
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES business_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
```

### 2.9 `product_variants`
Individual trackable variants of a product.
```sql
CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  variant_name TEXT NOT NULL,           -- e.g. 'Small / Blue'
  attribute_values_json TEXT NOT NULL,  -- e.g. '{"Size":"Small","Colour":"Blue"}'
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
CREATE INDEX IF NOT EXISTS idx_variants_barcode ON product_variants(workspace_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id, is_archived);
```

### 2.10 `stock_events` (Immutable Stock Ledger)
Every stock change is recorded as an immutable ledger row.
Supported `event_type` values:
- `OPENING_STOCK`
- `STOCK_INWARD`
- `PHYSICAL_COUNT`
- `STOCK_ADJUSTMENT`

```sql
CREATE TABLE IF NOT EXISTS stock_events (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  warehouse_id TEXT,
  item_key TEXT NOT NULL,               -- COALESCE(variant_id, product_id)
  product_id TEXT NOT NULL,
  variant_id TEXT,
  event_type TEXT NOT NULL CHECK(event_type IN ('OPENING_STOCK', 'STOCK_INWARD', 'PHYSICAL_COUNT', 'STOCK_ADJUSTMENT')),
  quantity REAL NOT NULL,               -- For OPENING_STOCK & PHYSICAL_COUNT: observed absolute quantity; for STOCK_INWARD: +qty received; for STOCK_ADJUSTMENT: signed delta
  previous_balance REAL,                -- Recorded balance prior to this event (NULL if previously UNKNOWN)
  resulting_balance REAL NOT NULL,      -- Recorded balance immediately after this event
  variance_quantity REAL,               -- Populated on PHYSICAL_COUNT (resulting_balance - previous_balance)
  event_date TEXT NOT NULL,             -- YYYY-MM-DD in business timezone
  event_timestamp TEXT NOT NULL,        -- Full ISO timestamp
  Sequence_no INTEGER NOT NULL,         -- Monotonic ordering key per workspace
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
```

### 2.11 `inventory_balances` (Current Materialised State per SKU)
Provides fast lookups for dashboard, product list, and low-stock register, always updated in the same transaction as `stock_events` and `product_threshold_history`.
```sql
CREATE TABLE IF NOT EXISTS inventory_balances (
  item_key TEXT PRIMARY KEY NOT NULL,   -- COALESCE(variant_id, product_id)
  workspace_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  variant_id TEXT,
  recorded_quantity REAL,               -- NULL when stock_status = 'UNKNOWN'
  min_stock_threshold REAL NOT NULL DEFAULT 0,
  stock_status TEXT NOT NULL CHECK(stock_status IN ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'UNKNOWN')),
  quantity_provenance TEXT NOT NULL CHECK(quantity_provenance IN ('PHYSICAL_COUNT', 'CALCULATED_INWARD_ONLY', 'CARRIED_FORWARD', 'UNKNOWN')),
  last_physical_count_date TEXT,        -- YYYY-MM-DD or NULL
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
```

### 2.12 `product_threshold_history`
Preserves historical minimum stock thresholds with effective business dates so historical reports never overwrite past thresholds with today's threshold.
```sql
CREATE TABLE IF NOT EXISTS product_threshold_history (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  product_id TEXT NOT NULL,
  variant_id TEXT,
  min_stock_threshold REAL NOT NULL,
  effective_from_date TEXT NOT NULL,    -- YYYY-MM-DD in business timezone
  effective_timestamp TEXT NOT NULL,
  sequence_no INTEGER NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES business_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_threshold_history_lookup ON product_threshold_history(workspace_id, item_key, effective_from_date, sequence_no);
```

### 2.13 `daily_inventory_snapshots`
Read-model table storing deterministic end-of-day inventory state per item and calendar date (`YYYY-MM-DD`). Rebuilt/updated automatically whenever stock events or threshold changes occur.
```sql
CREATE TABLE IF NOT EXISTS daily_inventory_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  product_id TEXT NOT NULL,
  variant_id TEXT,
  snapshot_date TEXT NOT NULL,          -- YYYY-MM-DD
  recorded_quantity REAL,               -- NULL if UNKNOWN
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
```

### 2.14 `notifications` & `notification_settings`
```sql
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
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(workspace_id, is_read, created_at DESC);
```

### 2.15 `audit_logs`
```sql
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
```
