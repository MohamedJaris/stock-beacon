# API & Repository Contracts
# StockBeacon — Domain & Data Layer Interfaces

---

## 1. Repository Interfaces (`src/domain/repositories/`)

All repositories use asynchronous Promises and support execution inside an active SQLite transaction context (`TransactionContext`) so multi-table workflows execute atomically.

### 1.1 `IWorkspaceRepository`
```typescript
export interface IWorkspaceRepository {
  getActiveProfile(): Promise<BusinessProfile | null>;
  saveProfile(profile: CreateBusinessProfileInput): Promise<BusinessProfile>;
  updateProfile(id: string, updates: Partial<BusinessProfile>): Promise<BusinessProfile>;
  getNotificationSettings(workspaceId: string): Promise<NotificationSettings>;
  updateNotificationSettings(settings: NotificationSettings): Promise<void>;
}
```

### 1.2 `ICatalogRepository` (Categories, Units, Suppliers, Products, Variants)
```typescript
export interface ICatalogRepository {
  // Categories
  listCategories(workspaceId: string, includeArchived?: boolean): Promise<Category[]>;
  saveCategory(category: CreateCategoryInput): Promise<Category>;
  updateCategory(id: string, updates: Partial<Category>): Promise<Category>;

  // Units of Measure
  listUnits(workspaceId: string, includeArchived?: boolean): Promise<UnitOfMeasure[]>;
  saveUnit(unit: CreateUnitInput): Promise<UnitOfMeasure>;

  // Suppliers
  listSuppliers(workspaceId: string, includeArchived?: boolean): Promise<Supplier[]>;
  saveSupplier(supplier: CreateSupplierInput): Promise<Supplier>;
  updateSupplier(id: string, updates: Partial<Supplier>): Promise<Supplier>;
  getSupplierInwardHistory(workspaceId: string, supplierId: string): Promise<StockEventWithProduct[]>;

  // Products & Variants
  listProductsWithBalances(workspaceId: string, filter?: ProductFilter): Promise<ProductSummaryView[]>;
  getProductDetail(workspaceId: string, productId: string): Promise<ProductDetailView | null>;
  findItemByBarcode(workspaceId: string, barcode: string): Promise<BarcodeLookupResult | null>;
  isSkuTaken(workspaceId: string, sku: string, excludeId?: string): Promise<boolean>;
  isBarcodeTaken(workspaceId: string, barcode: string, excludeId?: string): Promise<boolean>;
  createProductWithVariants(input: CreateProductCommand): Promise<ProductDetailView>;
  updateProduct(input: UpdateProductCommand): Promise<ProductDetailView>;
  archiveProduct(workspaceId: string, productId: string, archived: boolean): Promise<void>;
}
```

### 1.3 `IInventoryRepository` (Ledger, Balances, Threshold History, Snapshots)
```typescript
export interface IInventoryRepository {
  recordStockInward(command: RecordStockInwardCommand): Promise<StockOperationResult>;
  recordBatchPhysicalCount(command: BatchPhysicalCountCommand): Promise<BatchPhysicalCountResult>;
  recordStockAdjustment(command: RecordStockAdjustmentCommand): Promise<StockOperationResult>;
  updateMinimumThreshold(command: UpdateThresholdCommand): Promise<StockOperationResult>;
  rebuildItemStateAndSnapshots(workspaceId: string, itemKey: string, fromDate: string, throughDate: string): Promise<void>;
  getItemLedger(workspaceId: string, itemKey: string, filter?: DateRangeFilter): Promise<StockEvent[]>;
  getLowStockRegister(workspaceId: string, filter?: LowStockFilter): Promise<InventoryItemView[]>;
  getDailyLowStockHistoryReport(workspaceId: string, query: HistoricalReportQuery): Promise<DailyLowStockReportResult>;
  getConsolidatedLowStockReport(workspaceId: string, query: HistoricalReportQuery): Promise<ConsolidatedLowStockReportResult>;
  getDashboardMetrics(workspaceId: string, todayDate: string): Promise<DashboardMetrics>;
}
```

### 1.4 `IBackupRestoreService`
```typescript
export interface IBackupRestoreService {
  createBackupPayload(workspaceId: string): Promise<BackupBundle>;
  exportBackupToFile(workspaceId: string): Promise<string>;
  validateBackupContent(jsonString: string): BackupValidationResult;
  restoreFromBackup(bundle: BackupBundle): Promise<void>;
}
```

---

## 2. Future Cloud Synchronisation Contract (v2 Readiness)

Every domain table uses UUID v4 identifiers (`id`), `workspace_id`, `created_at`, and `updated_at`. Furthermore, `stock_events` and `product_threshold_history` are append-only immutable ledgers with a monotonic `sequence_no`.
When an optional Spring Boot + PostgreSQL backend is added in the future:
- Local writes append events to the local SQLite ledger and mark them for sync.
- Remote pulls merge ledger events by `(workspace_id, item_key, event_date, event_timestamp, id)` and invoke `InventoryCalculationEngine.rebuildItemStateAndSnapshots()` deterministically.
