# Comprehensive Test Plan
# StockBeacon — Verification of All 57 Mandatory Acceptance Cases

---

## 1. Testing Strategy

StockBeacon enforces a 3-tier automated testing strategy using **Jest** + **ts-jest**:
1. **Unit Tests (`tests/unit/`)**:
   - Decimal arithmetic (`quantityMath.test.ts`).
   - Authoritative inventory calculation engine (`inventoryCalculationEngine.test.ts`).
   - Low-stock status rules & non-duplicate alert state machine (`lowStockAlertEngine.test.ts`).
   - Historical daily snapshots, threshold preservation, and consolidated low-stock reporting (`historicalReportEngine.test.ts`).
2. **Repository & Integration Tests (`tests/integration/`)**:
   - Full end-to-end workflow tests executing against an in-memory / SQLite database adapter (`sqliteInventoryWorkflow.test.ts`).
   - Backup creation, schema checksum validation, corruption rejection, and full restore verification (`backupRestore.test.ts`).
3. **UI & Validation Schema Tests (`tests/unit/validationSchemas.test.ts`)**:
   - Product creation validation, duplicate SKU/barcode rejection, negative threshold rejection, inclusive date-range validation.

---

## 2. Traceability Matrix (Mandatory Acceptance Test Cases 1–57)

| Case # | Category | Requirement Description | Test Suite Coverage |
|---:|---|---|---|
| 1 | Product Mgmt | Create a product with valid details | `sqliteInventoryWorkflow.test.ts` |
| 2 | Product Mgmt | Create a product without optional fields | `sqliteInventoryWorkflow.test.ts` |
| 3 | Product Mgmt | Reject duplicate SKUs | `sqliteInventoryWorkflow.test.ts` |
| 4 | Product Mgmt | Reject invalid minimum thresholds (negative / NaN) | `validationSchemas.test.ts` & `sqliteInventoryWorkflow.test.ts` |
| 5 | Product Mgmt | Archive a product with transaction history without losing history | `sqliteInventoryWorkflow.test.ts` |
| 6 | Product Mgmt | Create product variants with independently maintained stock quantities | `sqliteInventoryWorkflow.test.ts` |
| 7 | Stock Mgmt | Add opening stock of 100 units | `inventoryCalculationEngine.test.ts` |
| 8 | Stock Mgmt | Record inward stock of 50 units | `inventoryCalculationEngine.test.ts` |
| 9 | Stock Mgmt | Verify calculated recorded balance is 150 | `inventoryCalculationEngine.test.ts` |
| 10 | Stock Mgmt | Record a physical stock count of 120 | `inventoryCalculationEngine.test.ts` |
| 11 | Stock Mgmt | Verify recorded balance becomes 120 | `inventoryCalculationEngine.test.ts` |
| 12 | Stock Mgmt | Record further inward stock of 30 | `inventoryCalculationEngine.test.ts` |
| 13 | Stock Mgmt | Verify recorded balance becomes 150 | `inventoryCalculationEngine.test.ts` |
| 14 | Stock Mgmt | Verify a physical stock count is never represented as a sale | `inventoryCalculationEngine.test.ts` |
| 15 | Stock Mgmt | Verify a product without an opening or count baseline displays UNKNOWN rather than zero | `inventoryCalculationEngine.test.ts` |
| 16 | Low-Stock Rules | Minimum threshold is 20 and quantity is 30 -> `IN_STOCK` | `lowStockAlertEngine.test.ts` |
| 17 | Low-Stock Rules | Minimum threshold is 20 and quantity is 20 -> `LOW_STOCK` | `lowStockAlertEngine.test.ts` |
| 18 | Low-Stock Rules | Minimum threshold is 20 and quantity is 19 -> `LOW_STOCK` | `lowStockAlertEngine.test.ts` |
| 19 | Low-Stock Rules | Quantity is zero -> `OUT_OF_STOCK` | `lowStockAlertEngine.test.ts` |
| 20 | Low-Stock Rules | Quantity is unknown -> `UNKNOWN` | `lowStockAlertEngine.test.ts` |
| 21 | Low-Stock Rules | Repeated dashboard visits do not create duplicate alerts | `lowStockAlertEngine.test.ts` |
| 22 | Low-Stock Rules | Restocking above threshold resets the low-stock state | `lowStockAlertEngine.test.ts` |
| 23 | Low-Stock Rules | Changing a threshold correctly reevaluates stock status & alert transition | `lowStockAlertEngine.test.ts` |
| 24 | Historical Reports | Generate daily low-stock reports for a five-day date range | `historicalReportEngine.test.ts` |
| 25 | Historical Reports | Verify each date displays its own historical quantity | `historicalReportEngine.test.ts` |
| 26 | Historical Reports | Generate a consolidated low-stock report | `historicalReportEngine.test.ts` |
| 27 | Historical Reports | Verify each product appears only once in consolidated report | `historicalReportEngine.test.ts` |
| 28 | Historical Reports | Verify lowest recorded quantity in consolidated report | `historicalReportEngine.test.ts` |
| 29 | Historical Reports | Verify the number of low-stock days | `historicalReportEngine.test.ts` |
| 30 | Historical Reports | Verify first and last low-stock dates | `historicalReportEngine.test.ts` |
| 31 | Historical Reports | Change today's threshold and verify previous historical reports remain unchanged | `historicalReportEngine.test.ts` |
| 32 | Historical Reports | Record a backdated transaction and verify affected snapshots are recalculated | `historicalReportEngine.test.ts` |
| 33 | Historical Reports | Verify carried-forward balances are identified correctly (`CARRIED_FORWARD`) | `historicalReportEngine.test.ts` |
| 34 | Historical Reports | Verify UNKNOWN quantities are not incorrectly reported as out of stock | `historicalReportEngine.test.ts` |
| 35 | Historical Reports | Verify date-range boundaries are inclusive | `historicalReportEngine.test.ts` |
| 36–44 | Offline & Persistence | Profile creation, product & stock persistence across DB re-instantiation in offline mode | `sqliteInventoryWorkflow.test.ts` |
| 45–51 | Backup & Restore | Create backup, restore into clean DB, verify products/variants/events/reports/thresholds/settings, reject corrupted backup | `backupRestore.test.ts` |
| 52–57 | Mobile Quality | Navigation, camera/barcode permissions, notification permissions, responsive layouts, and mobile build verification | `mobileQualityAndBuild.test.ts` & Release Build |
