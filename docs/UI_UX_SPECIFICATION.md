# UI/UX Design Specification
# StockBeacon — Mobile-First Business Interface

---

## 1. Design Philosophy & Visual Language

StockBeacon is designed as a **high-clarity, one-handed, shop-floor-friendly mobile business application**.
- **Typography**: Crisp hierarchy with tabular-numeral look for stock quantities, bold section headers, and readable secondary captions.
- **Semantic Status System (Never Rely on Colour Alone)**:
  - **IN_STOCK**: Emerald Green (`#059669` text, `#ECFDF5` background, `#A7F3D0` border) + Check-Circle Icon + `"In Stock"` label.
  - **LOW_STOCK**: Amber Warning (`#D97706` text, `#FFFBEB` background, `#FDE68A` border) + Alert-Triangle Icon + `"Low Stock"` label.
  - **OUT_OF_STOCK**: Crimson Critical (`#DC2626` text, `#FEF2F2` background, `#FECACA` border) + X-Circle Icon + `"Out of Stock"` label.
  - **UNKNOWN**: Slate Neutral (`#475569` text, `#F1F5F9` background, `#CBD5E1` border) + Help-Circle Icon + `"No Baseline"` label.
- **Quantity Provenance Badges**:
  - `PHYSICAL_COUNT`: `"Verified Count"` (Indigo badge + clipboard-check icon)
  - `CALCULATED_INWARD_ONLY`: `"Inward-Only Balance"` (Sky-blue badge + arrow-down-circle icon)
  - `CARRIED_FORWARD`: `"Carried Forward"` (Slate badge + clock icon)
  - `UNKNOWN`: `"Unverified / No Baseline"` (Muted badge)

---

## 2. Navigation Architecture

### 2.1 Bottom Tab Bar (5 Primary Sections)
1. **Home (`/(tabs)/index`)**:
   - Business header with quick barcode scan button & notification bell (with unread badge).
   - 6 KPI summary cards (Total SKUs, In Stock, Low Stock, Out of Stock, Inward Today, Needs Physical Count).
   - Quick Action bar: `+ Stock Inward`, `Physical Count`, `Low-Stock Register`, `Date Reports`.
   - Immediate Low-Stock Alert Strip (top priority items needing replenishment).
   - Stock Status Overview bar chart & Category Distribution breakdown.
   - Recent Stock Ledger Activity feed.
2. **Products (`/(tabs)/products`)**:
   - Search bar (name, SKU, barcode) + Scanner trigger + Category filter chips + Status filter chips + Sort selector.
   - Sub-tabs / Modals for managing **Categories** and **Units of Measure**.
   - Product Cards showing SKU, Category, current recorded quantity + unit, minimum threshold, status badge, provenance badge, and variant count.
3. **Stock (`/(tabs)/stock`)**:
   - Four focused sub-views:
     1. **Stock Inward**: Fast inward receipt form with barcode scan, product/variant picker, supplier selector, reference/invoice number, date/time picker, and live post-inward balance preview.
     2. **Daily Physical Count**: Multi-item count sheet filterable by category/search. Shows each item's current recorded balance, input field for observed physical count, live variance badge (`Diff: -5 pcs (Count Reconciliation)`), and atomic batch save.
     3. **Stock Adjustment**: Controlled adjustment form with mandatory reason selector (`Damage / Breakage`, `Audit Correction`, `Measurement Loss`, `Found Stock`, `Other`) and signed delta.
     4. **Stock Ledger**: Chronological immutable audit log of all stock events with filters.
4. **Reports (`/(tabs)/reports`)**:
   - Inclusive Date Range selector (`Start Date` to `End Date` with quick presets: `Last 5 Days`, `Last 7 Days`, `This Month`, `Custom Range`).
   - Report Mode Switcher:
     - **Report A: Daily Low-Stock History** (Expandable day-by-day cards showing historical quantity, historical threshold on that date, status, and provenance; toggleable between *Low-Stock Only* and *Full Daily History*).
     - **Report B: Consolidated Low-Stock Report** (Unique products/variants that hit low/out-of-stock during the range, showing lowest quantity, low-stock days, out-of-stock days, first & last date, and drill-down button).
     - **Additional Reports**: Current Inventory, Stock Inward Summary, Category Breakdown, Physical Count Variance Report, Adjustment Report.
   - One-tap **Export CSV** and **Export PDF** buttons invoking the native share sheet.
5. **Settings (`/(tabs)/settings`)**:
   - Business Profile configuration.
   - Supplier Directory shortcut.
   - Local Notification & Reminder toggles and time pickers.
   - Backup & Restore center (Create Versioned Backup, Share Backup File, Validate & Restore Backup).
