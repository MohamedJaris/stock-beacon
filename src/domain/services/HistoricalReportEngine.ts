import { getInclusiveDateRange } from '@/core/utils/dateUtils';
import { compareQuantities } from '@/core/utils/quantityMath';
import { DailyInventorySnapshot } from '../entities';
import { QuantityProvenance, StockStatus } from '../enums';

export interface ItemMetadataForReport {
  itemKey: string;
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  displayName: string;
  sku: string;
  categoryId: string;
  categoryName: string;
  unitSymbol: string;
}

export interface DailyReportRow {
  snapshotDate: string;
  itemKey: string;
  productId: string;
  variantId: string | null;
  displayName: string;
  sku: string;
  categoryId: string;
  categoryName: string;
  unitSymbol: string;
  recordedQuantity: number | null;
  minStockThreshold: number;
  stockStatus: StockStatus;
  quantitySource: QuantityProvenance;
  lastPhysicalCountDate: string | null;
}

export interface DailyReportDateGroup {
  date: string;
  totalLowOrOutCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  items: DailyReportRow[];
}

export interface DailyLowStockReportResult {
  startDate: string;
  endDate: string;
  includeAllStatuses: boolean;
  days: DailyReportDateGroup[];
  totalMatchingEntries: number;
}

export interface ConsolidatedLowStockItem {
  itemKey: string;
  productId: string;
  variantId: string | null;
  displayName: string;
  sku: string;
  categoryId: string;
  categoryName: string;
  unitSymbol: string;
  applicableThreshold: number; // Latest applicable threshold in the window
  minApplicableThreshold: number;
  maxApplicableThreshold: number;
  lowestRecordedQuantity: number;
  lowStockDays: number; // Days where status === 'LOW_STOCK'
  outOfStockDays: number; // Days where status === 'OUT_OF_STOCK'
  totalAffectedDays: number; // Days where status === 'LOW_STOCK' or 'OUT_OF_STOCK'
  firstLowStockDate: string;
  lastLowStockDate: string;
  latestQuantitySource: QuantityProvenance;
}

export interface ConsolidatedLowStockReportResult {
  startDate: string;
  endDate: string;
  items: ConsolidatedLowStockItem[];
}

/**
 * Generates Report A: Daily Low-Stock History (or full daily history when includeAllStatuses = true).
 *
 * Rules enforced:
 * - Date range [startDate, endDate] is inclusive.
 * - UNKNOWN items are NEVER reported as low-stock or out-of-stock.
 * - Each calendar date in the selected range is represented so the user can expand any date.
 */
export function generateDailyLowStockHistory(params: {
  startDate: string;
  endDate: string;
  snapshots: DailyInventorySnapshot[];
  itemsMap: Map<string, ItemMetadataForReport>;
  categoryIdFilter?: string | null;
  itemKeyFilter?: string | null;
  searchQuery?: string;
  includeAllStatuses?: boolean;
}): DailyLowStockReportResult {
  const {
    startDate,
    endDate,
    snapshots,
    itemsMap,
    categoryIdFilter,
    itemKeyFilter,
    searchQuery,
    includeAllStatuses = false,
  } = params;

  const dates = getInclusiveDateRange(startDate, endDate);
  const normalizedSearch = searchQuery?.trim().toLowerCase() ?? '';

  const snapshotsByDate = new Map<string, DailyInventorySnapshot[]>();
  for (const d of dates) {
    snapshotsByDate.set(d, []);
  }

  for (const snap of snapshots) {
    if (snap.snapshotDate >= startDate && snap.snapshotDate <= endDate) {
      const bucket = snapshotsByDate.get(snap.snapshotDate);
      if (bucket) {
        bucket.push(snap);
      }
    }
  }

  let totalMatchingEntries = 0;
  const days: DailyReportDateGroup[] = dates.map((date) => {
    const daySnaps = snapshotsByDate.get(date) ?? [];
    const rows: DailyReportRow[] = [];
    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const snap of daySnaps) {
      const meta = itemsMap.get(snap.itemKey);
      if (!meta) continue;

      if (categoryIdFilter && meta.categoryId !== categoryIdFilter) {
        continue;
      }
      if (itemKeyFilter && meta.itemKey !== itemKeyFilter) {
        continue;
      }
      if (
        normalizedSearch &&
        !meta.displayName.toLowerCase().includes(normalizedSearch) &&
        !meta.sku.toLowerCase().includes(normalizedSearch)
      ) {
        continue;
      }

      const isLowOrOut =
        snap.stockStatus === 'LOW_STOCK' || snap.stockStatus === 'OUT_OF_STOCK';

      if (!includeAllStatuses && !isLowOrOut) {
        continue;
      }

      if (snap.stockStatus === 'LOW_STOCK') lowStockCount++;
      if (snap.stockStatus === 'OUT_OF_STOCK') outOfStockCount++;

      rows.push({
        snapshotDate: date,
        itemKey: snap.itemKey,
        productId: snap.productId,
        variantId: snap.variantId,
        displayName: meta.displayName,
        sku: meta.sku,
        categoryId: meta.categoryId,
        categoryName: meta.categoryName,
        unitSymbol: meta.unitSymbol,
        recordedQuantity: snap.recordedQuantity,
        minStockThreshold: snap.minStockThreshold,
        stockStatus: snap.stockStatus,
        quantitySource: snap.quantitySource,
        lastPhysicalCountDate: snap.lastPhysicalCountDate,
      });
    }

    rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
    totalMatchingEntries += rows.length;

    return {
      date,
      totalLowOrOutCount: lowStockCount + outOfStockCount,
      lowStockCount,
      outOfStockCount,
      items: rows,
    };
  });

  return {
    startDate,
    endDate,
    includeAllStatuses,
    days,
    totalMatchingEntries,
  };
}

/**
 * Generates Report B: Consolidated Low-Stock Report.
 *
 * Rules enforced:
 * - Every unique item that entered LOW_STOCK or OUT_OF_STOCK at least once during [startDate, endDate]
 *   appears EXACTLY ONCE.
 * - Tracks:
 *   - lowestRecordedQuantity during affected days (or across the range)
 *   - lowStockDays (days where status === 'LOW_STOCK')
 *   - outOfStockDays (days where status === 'OUT_OF_STOCK')
 *   - totalAffectedDays (days where status is LOW_STOCK or OUT_OF_STOCK)
 *   - firstLowStockDate and lastLowStockDate
 * - UNKNOWN quantities are never treated as low stock or out of stock.
 */
export function generateConsolidatedLowStockReport(params: {
  startDate: string;
  endDate: string;
  snapshots: DailyInventorySnapshot[];
  itemsMap: Map<string, ItemMetadataForReport>;
  categoryIdFilter?: string | null;
  searchQuery?: string;
}): ConsolidatedLowStockReportResult {
  const {
    startDate,
    endDate,
    snapshots,
    itemsMap,
    categoryIdFilter,
    searchQuery,
  } = params;

  // Validate date range
  getInclusiveDateRange(startDate, endDate);
  const normalizedSearch = searchQuery?.trim().toLowerCase() ?? '';

  const grouped = new Map<string, DailyInventorySnapshot[]>();
  for (const snap of snapshots) {
    if (snap.snapshotDate < startDate || snap.snapshotDate > endDate) {
      continue;
    }
    if (snap.stockStatus !== 'LOW_STOCK' && snap.stockStatus !== 'OUT_OF_STOCK') {
      continue;
    }
    const existing = grouped.get(snap.itemKey);
    if (existing) {
      existing.push(snap);
    } else {
      grouped.set(snap.itemKey, [snap]);
    }
  }

  const consolidatedItems: ConsolidatedLowStockItem[] = [];

  for (const [itemKey, affectedSnapshots] of grouped.entries()) {
    const meta = itemsMap.get(itemKey);
    if (!meta) continue;

    if (categoryIdFilter && meta.categoryId !== categoryIdFilter) {
      continue;
    }
    if (
      normalizedSearch &&
      !meta.displayName.toLowerCase().includes(normalizedSearch) &&
      !meta.sku.toLowerCase().includes(normalizedSearch)
    ) {
      continue;
    }

    const sortedSnaps = [...affectedSnapshots].sort((a, b) =>
      a.snapshotDate.localeCompare(b.snapshotDate)
    );

    // De-duplicate by snapshotDate in case duplicate snapshots were passed
    const uniqueByDate = new Map<string, DailyInventorySnapshot>();
    for (const s of sortedSnaps) {
      uniqueByDate.set(s.snapshotDate, s);
    }
    const distinctSnaps = Array.from(uniqueByDate.values());
    if (distinctSnaps.length === 0) continue;

    let lowestQty = distinctSnaps[0].recordedQuantity ?? 0;
    let lowStockDays = 0;
    let outOfStockDays = 0;
    let minThreshold = distinctSnaps[0].minStockThreshold;
    let maxThreshold = distinctSnaps[0].minStockThreshold;

    for (const s of distinctSnaps) {
      const qty = s.recordedQuantity ?? 0;
      if (compareQuantities(qty, lowestQty) < 0) {
        lowestQty = qty;
      }
      if (s.stockStatus === 'LOW_STOCK') {
        lowStockDays++;
      } else if (s.stockStatus === 'OUT_OF_STOCK') {
        outOfStockDays++;
      }
      if (s.minStockThreshold < minThreshold) minThreshold = s.minStockThreshold;
      if (s.minStockThreshold > maxThreshold) maxThreshold = s.minStockThreshold;
    }

    const firstSnap = distinctSnaps[0];
    const lastSnap = distinctSnaps[distinctSnaps.length - 1];

    consolidatedItems.push({
      itemKey,
      productId: meta.productId,
      variantId: meta.variantId,
      displayName: meta.displayName,
      sku: meta.sku,
      categoryId: meta.categoryId,
      categoryName: meta.categoryName,
      unitSymbol: meta.unitSymbol,
      applicableThreshold: lastSnap.minStockThreshold,
      minApplicableThreshold: minThreshold,
      maxApplicableThreshold: maxThreshold,
      lowestRecordedQuantity: lowestQty,
      lowStockDays,
      outOfStockDays,
      totalAffectedDays: lowStockDays + outOfStockDays,
      firstLowStockDate: firstSnap.snapshotDate,
      lastLowStockDate: lastSnap.snapshotDate,
      latestQuantitySource: lastSnap.quantitySource,
    });
  }

  consolidatedItems.sort((a, b) => {
    if (b.totalAffectedDays !== a.totalAffectedDays) {
      return b.totalAffectedDays - a.totalAffectedDays;
    }
    return a.lowestRecordedQuantity - b.lowestRecordedQuantity;
  });

  return {
    startDate,
    endDate,
    items: consolidatedItems,
  };
}
