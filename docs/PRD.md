# Product Requirements Document (PRD)
# StockBeacon — General-Purpose Offline-First Inventory Management Application

**Version:** 1.0.0  
**Status:** Approved for Development  
**Target Platforms:** Android (APK/AAB), iOS (App Store / Ad-Hoc)  
**Architecture Mode:** Standalone Offline-First (Future Cloud-Sync Ready)

---

## 1. Executive Summary & Vision

**StockBeacon** is a standalone, production-grade, offline-first mobile inventory management application designed for diverse retail, wholesale, distribution, and small warehouse businesses (including textile shops, stationery stores, grocery stores, hardware shops, electrical & electronics stores, and general retail).

The core mission of StockBeacon is to provide **trustworthy inventory visibility, inward stock tracking, physical stock count reconciliation, historical low-stock analysis, and automated replenishment alerts** without requiring an internet connection, cloud account, or POS/billing integration.

### 1.1 Critical Business Constraint (Non-POS / Inward & Physical Count Model)
StockBeacon **does NOT track sales, billing, POS checkouts, or explicit outgoing stock transactions**.
Inventory quantities are governed strictly by four authoritative inputs:
1. **Opening Stock (`OPENING_STOCK`)**: The baseline inventory established when a product or variant is registered.
2. **Stock Inward (`STOCK_INWARD`)**: Goods received from suppliers or replenishment deliveries.
3. **Physical Stock Count (`PHYSICAL_COUNT`)**: Observed physical stock counted on the shop floor or warehouse shelf at a point in time, which resets the active baseline to the verified physical quantity.
4. **Explicit Stock Adjustment (`STOCK_ADJUSTMENT`)**: Controlled, audited manual corrections (with mandatory reason codes such as damage, spoilage, audit correction, or shrinkage).

> **Crucial Distinction:** StockBeacon explicitly distinguishes between a **Calculated Inward-Only Balance** (`CALCULATED_INWARD_ONLY` — derived from opening balance + inward receipts + adjustments) and a **Verified Physical Count** (`PHYSICAL_COUNT`). Furthermore, when a physical count is lower than the previously recorded balance, the difference is recorded as a count variance (`variance = observed - previous`), **never** as a "sale" or "stock out".

---

## 2. Target Personas & Industries

- **Store Owner / Proprietor**: Needs a 5-second health check on the dashboard, clear low-stock and out-of-stock registers, historical low-stock trends to negotiate with suppliers, and reliable local backups.
- **Inventory Clerk / Shop Floor Manager**: Needs rapid barcode scanning, quick stock-inward entry when deliveries arrive, and fast batch physical stock counting by category.

Supported industry configurations (zero hardcoded restrictions):
- Textile & Apparel (supports multi-attribute variants like Size × Colour, and units like Metres, Rolls, Pieces).
- Stationery & Office Supplies (Packs, Boxes, Dozens, Pieces).
- Grocery & Provisions (Kilograms, Grams, Litres, Millilitres, Packets; fractional quantities supported).
- Hardware, Electrical & Electronics (Units, Metres, Feet, Boxes, Sets).
- Wholesale, Warehousing & Distribution.

---

## 3. Functional Scope & Feature Requirements

### 3.1 Onboarding & Workspace Configuration
- First-launch guided setup for local business profile:
  - Business Name (required)
  - Business Type (configurable preset or custom)
  - Owner Name, Contact Number, Business Address (optional)
  - Country, Preferred Date Format (`DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD`), Local Timezone (IANA timezone, e.g., `Asia/Kolkata`), Default Measurement Unit.
- Multi-tenant data model readiness (`workspace_id` on all entities) with a single active local workspace in v1.

### 3.2 Product, Category, Unit & Variant Management
- **Categories & Subcategories**: User-defined hierarchy, colour-coded badges, archival protection.
- **Units of Measurement (UoM)**: Pre-seeded standard units (`pcs`, `units`, `kg`, `g`, `L`, `mL`, `m`, `cm`, `ft`, `boxes`, `packs`, `dozens`, `rolls`) + custom user-created units with configurable decimal precision (`allow_fractional`: boolean, scale up to 3 decimal places).
- **Products**:
  - Name, Unique SKU (auto-generatable or manual), Barcode (EAN-13, EAN-8, UPC-A, Code 128, QR, etc.), Category, Subcategory, Description, Unit of Measurement, Minimum Stock Threshold, Reorder Quantity, Default Supplier, Product Image (local file storage), Active/Archived state.
- **Product Variants (Optional per Product)**:
  - Configurable attribute axes (e.g., `Size`, `Colour`, `Material`, `Grade`, `Capacity`).
  - Each variant maintains its own independent SKU, Barcode, Opening Stock, Minimum Stock Threshold, Reorder Quantity, Stock Ledger, and Daily Inventory Snapshots.

### 3.3 Inventory & Stock Operations
- **Opening Stock (`OPENING_STOCK`)**: Recorded atomically upon product/variant creation (or initial baseline establishment). If omitted/skipped, product starts with `UNKNOWN` stock status until an opening stock or physical count is recorded.
- **Stock Inward (`STOCK_INWARD`)**: Record quantity received, receipt date & time, optional supplier, invoice/reference number, and notes.
- **Daily Physical Stock Count (`PHYSICAL_COUNT`)**:
  - Batch or single-item count session for a selected business date.
  - Filter by category or search by name/SKU/barcode.
  - Displays previously recorded balance alongside entered physical count and live variance preview.
  - Commits atomically as `PHYSICAL_COUNT` ledger events.
- **Stock Adjustment (`STOCK_ADJUSTMENT`)**:
  - Signed quantity delta (`+` or `-`), mandatory reason code, date, and audit note.
- **Immutable Stock Event Ledger**:
  - Chronological log of all events (`OPENING_STOCK`, `STOCK_INWARD`, `PHYSICAL_COUNT`, `STOCK_ADJUSTMENT`).

### 3.4 Low-Stock Management & Alert Engine
- Four deterministic stock states:
  - `IN_STOCK`: `quantity > minimumStockThreshold`
  - `LOW_STOCK`: `0 < quantity <= minimumStockThreshold`
  - `OUT_OF_STOCK`: `quantity == 0`
  - `UNKNOWN`: No baseline (`OPENING_STOCK` or `PHYSICAL_COUNT`) exists yet.
- Dedicated Low-Stock & Out-of-Stock Register with filters, sorting by urgency/lowest quantity, quantity provenance badge (`Physical Count` vs `Inward-Only Balance`), and suggested reorder quantity.
- State-transition alert engine: Generates alerts only when transitioning into `LOW_STOCK` or `OUT_OF_STOCK` (or when a threshold increase causes a transition), preventing duplicate alerts on dashboard views. Reset alert state when replenished to `IN_STOCK`.

### 3.5 Historical Inventory Reporting
- Inclusive `[startDate, endDate]` filtering in business-local timezone.
- **Historical Threshold Preservation**: Every threshold change is recorded in `product_threshold_history` with an effective timestamp/date so past dates are always evaluated against the threshold that was active on that date.
- **Deterministic Daily Inventory Snapshots (`daily_inventory_snapshots`)**:
  - Stores end-of-day quantity, applicable threshold, stock status, quantity provenance (`PHYSICAL_COUNT`, `CALCULATED_INWARD_ONLY`, `CARRIED_FORWARD`, `UNKNOWN`), and last physical count date.
  - Automatically recalculated forward whenever a backdated stock event or threshold change occurs.
- **Report A: Daily Low-Stock History**:
  - Expandable date-by-date accordion/list showing all items below or equal to their historical threshold at the end of each day (plus toggle to view all stock history).
- **Report B: Consolidated Low-Stock Report**:
  - De-duplicated product/variant summary over `[startDate, endDate]` showing each affected item once, along with: applicable threshold, lowest recorded quantity, low-stock days count, out-of-stock days count, total affected days, first low-stock date, last low-stock date, and drill-down link to product history.
- **Additional Reports**:
  - Current Inventory Report, Stock Inward Report, Product-Wise Stock History, Category-Wise Inventory Report, Physical Stock-Count Report, and Stock Adjustment Report.
- **Exports**: CSV and formatted PDF generation with native device share sheet integration.

### 3.6 Supplier Management, Barcode Scanning, Notifications, Backup & Restore
- **Suppliers**: Optional directory (Name, Phone, Email, Address, Notes) linked to products and inward entries.
- **Barcode Scanning**: Offline camera barcode scanning (`expo-camera`) for product lookup, quick stock-inward, physical count lookup, and duplicate barcode detection.
- **Local Notifications**: Configurable local alerts (`expo-notifications`) for low-stock transitions, daily stock count reminders, and daily low-stock summary.
- **Versioned Backup & Restore**: Full JSON/SQLite-verified export bundle with schema version, SHA-256 / checksum integrity verification, pre-restore validation, automatic pre-restore safety backup export, and atomic database restoration.
