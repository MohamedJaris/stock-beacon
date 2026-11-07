# System Architecture Document
# StockBeacon — General-Purpose Offline-First Inventory Management Application

---

## 1. Architectural Style & Core Principles

StockBeacon uses a **Clean, Layered, Feature-Modular Offline-First Architecture** designed for React Native + Expo SDK + SQLite (`expo-sqlite`).

### Key Engineering Guarantees:
1. **Strict Layer Separation**:
   - **Domain Layer (`src/domain/`)**: Pure TypeScript business entities, value objects, stock calculation algorithms, threshold rules, alert state-machine transitions, and historical snapshot builders. Zero imports from `react-native`, `expo-*`, or `expo-sqlite`.
   - **Application Layer (`src/application/`)**: Use cases, transaction orchestrators, report generators, backup/restore validators, and notification schedulers. Depends on Domain and Data Repository interfaces.
   - **Data Layer (`src/data/`)**: SQLite connection management, versioned schema migrations, transactional repository implementations, CSV/PDF file writers, and backup serializers.
   - **Presentation Layer (`src/app/`, `src/features/`, `src/components/`)**: Expo Router screens, feature modules, reusable UI components, Zustand state stores, and React Hook Form + Zod validation schemas.
2. **Single Authoritative Inventory Calculation Engine**:
   - All balance derivations, status evaluations (`IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`, `UNKNOWN`), provenance tracking (`PHYSICAL_COUNT`, `CALCULATED_INWARD_ONLY`, `CARRIED_FORWARD`, `UNKNOWN`), and daily snapshot computations reside in `src/domain/services/InventoryCalculationEngine.ts`.
   - UI components never compute balances or stock statuses ad-hoc.
3. **Safe Decimal Arithmetic**:
   - To eliminate IEEE-754 floating-point errors (e.g., `0.1 + 0.2 = 0.30000000000000004` when adding kilograms or metres), all quantities are processed through a dedicated `QuantityMath` utility (`src/core/utils/quantityMath.ts`) using scaled integer arithmetic (`SCALE_FACTOR = 1000`, supporting up to 3 decimal places accurately) and persisted cleanly.
4. **Atomic Database Transactions**:
   - Every write operation (recording stock inward, committing batch physical counts, creating a product with opening stock and initial threshold history, adjusting stock, or restoring a backup) executes inside an explicit SQLite transaction (`withTransactionAsync` / `withExclusiveTransactionAsync`).

---

## 2. Directory Structure

```text
stock-beacon/
├── app.json
├── eas.json
├── package.json
├── tsconfig.json
├── babel.config.js
├── jest.config.js
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE_SCHEMA.md
│   ├── STOCK_CALCULATION_RULES.md
│   ├── API_AND_REPOSITORY_CONTRACTS.md
│   ├── UI_UX_SPECIFICATION.md
│   ├── TEST_PLAN.md
│   └── BUILD_AND_RELEASE.md
├── assets/
│   ├── icon.png
│   ├── splash-icon.png
│   └── adaptive-icon.png
├── src/
│   ├── app/                          # Expo Router entrypoints & navigation layouts
│   │   ├── _layout.tsx               # Root provider, DB initialization, onboarding gate
│   │   ├── onboarding.tsx            # Business profile onboarding wizard
│   │   ├── scanner.tsx               # Modal barcode scanner screen
│   │   ├── notifications.tsx         # In-app notifications center
│   │   ├── suppliers/                # Supplier management screens
│   │   ├── low-stock/                # Dedicated Low-Stock & Out-of-Stock Register
│   │   ├── product/                  # Product create, edit, detail, variants, history
│   │   └── (tabs)/                   # 5 primary bottom navigation tabs
│   │       ├── _layout.tsx
│   │       ├── index.tsx             # 1. Home (Dashboard)
│   │       ├── products.tsx          # 2. Products (Catalog, Categories, Units)
│   │       ├── stock.tsx             # 3. Stock (Inward, Physical Count, Adjustment, Ledger)
│   │       ├── reports.tsx           # 4. Reports (Daily Low-Stock, Consolidated, Exports)
│   │       └── settings.tsx          # 5. Settings (Profile, Backup/Restore, Notifications)
│   ├── core/
│   │   ├── constants/
│   │   ├── errors/
│   │   ├── types/
│   │   ├── utils/
│   │   │   ├── quantityMath.ts       # Exact scaled-integer decimal math
│   │   │   ├── dateUtils.ts          # Business timezone calendar date formatting & ranges
│   │   │   └── skuGenerator.ts       # Deterministic SKU & checksum utilities
│   │   └── validation/
│   │       └── schemas.ts            # Zod schemas for all forms & backup imports
│   ├── domain/
│   │   ├── entities/                 # Pure domain models
│   │   ├── enums/                    # StockStatus, StockEventType, QuantityProvenance, etc.
│   │   └── services/
│   │       ├── InventoryCalculationEngine.ts
│   │       ├── LowStockAlertEngine.ts
│   │       └── HistoricalReportEngine.ts
│   ├── application/
│   │   ├── dto/
│   │   └── services/
│   │       ├── InventoryApplicationService.ts
│   │       ├── ProductApplicationService.ts
│   │       ├── ReportExportService.ts
│   │       ├── BackupRestoreService.ts
│   │       └── NotificationService.ts
│   ├── data/
│   │   ├── database/
│   │   │   ├── DatabaseConnection.ts
│   │   │   ├── migrations/
│   │   │   │   └── index.ts          # Versioned SQLite migrations
│   │   │   └── seed/
│   │   │       └── defaultSeed.ts    # Default Units of Measure & starter presets
│   │   └── repositories/
│   │       ├── SqliteWorkspaceRepository.ts
│   │       ├── SqliteProductRepository.ts
│   │       ├── SqliteInventoryRepository.ts
│   │       ├── SqliteSupplierRepository.ts
│   │       └── SqliteNotificationRepository.ts
│   ├── components/
│   │   ├── common/                   # Button, Card, Badge, EmptyState, SearchBar, Modal
│   │   ├── forms/                    # FormField, QuantityInput, DateRangePicker, PickerModal
│   │   ├── inventory/                # StatusBadge, ProvenanceBadge, StockSummaryCard
│   │   └── charts/                   # SVG-based native distribution & status bar charts
│   ├── stores/
│   │   └── useAppStore.ts            # Zustand global reactive store synced with SQLite
│   └── theme/
│       └── index.ts                  # Design tokens (colours, spacing, typography, shadows)
└── tests/
    ├── unit/
    │   ├── quantityMath.test.ts
    │   ├── inventoryCalculationEngine.test.ts
    │   ├── lowStockAlertEngine.test.ts
    │   └── historicalReportEngine.test.ts
    └── integration/
        ├── sqliteInventoryWorkflow.test.ts
        └── backupRestore.test.ts
```

---

## 3. Data Flow & State Management

1. **Cold Start Flow**:
   - Root `_layout.tsx` opens the SQLite database (`stock_beacon.db`), enables `PRAGMA foreign_keys = ON;` and `PRAGMA journal_mode = WAL;`, runs pending versioned schema migrations, and loads the active `BusinessProfile`.
   - If no `BusinessProfile` exists, Expo Router redirects to `/onboarding`.
   - Once onboarded, the user lands on `/(tabs)` (Home Dashboard).
2. **Write Path (Command Pattern)**:
   - User submits a form (validated via React Hook Form + Zod).
   - Screen invokes an `ApplicationService` method (e.g., `InventoryApplicationService.recordStockInward(...)`).
   - Service opens an atomic SQLite transaction, reads current ledger state & threshold, runs `InventoryCalculationEngine` to compute new balance, provenance, status, alert transitions, and affected `DailyInventorySnapshot` records, persists all rows atomically, and triggers `useAppStore.refresh()` to update UI subscribers immediately.
3. **Future Cloud Synchronisation Readiness**:
   - Every entity includes `id` (UUID v4 string), `workspace_id`, `created_at`, `updated_at`, and `sync_version` / `is_deleted` metadata where applicable so a future Spring Boot + PostgreSQL sync adapter can implement the same repository contracts without modifying domain or presentation layers.
