import {
  generateConsolidatedLowStockReport,
  generateDailyLowStockHistory,
  ItemMetadataForReport,
} from '@/domain/services/HistoricalReportEngine';
import {
  buildDailyInventorySnapshots,
  calculateLedgerState,
} from '@/domain/services/InventoryCalculationEngine';

describe('Historical Inventory Reporting Engine (Mandatory Cases 24-35)', () => {
  const workspaceId = 'ws-hist';

  const cottonMeta: ItemMetadataForReport = {
    itemKey: 'prod-cotton',
    productId: 'prod-cotton',
    variantId: null,
    productName: 'Cotton Fabric',
    variantName: null,
    displayName: 'Cotton Fabric',
    sku: 'FAB-COT-001',
    categoryId: 'cat-1',
    categoryName: 'Fabrics',
    unitSymbol: 'm',
  };

  const paperMeta: ItemMetadataForReport = {
    itemKey: 'prod-paper',
    productId: 'prod-paper',
    variantId: null,
    productName: 'A4 Paper',
    variantName: null,
    displayName: 'A4 Paper',
    sku: 'STN-A4-002',
    categoryId: 'cat-2',
    categoryName: 'Paper',
    unitSymbol: 'packs',
  };

  const unknownMeta: ItemMetadataForReport = {
    itemKey: 'prod-unknown',
    productId: 'prod-unknown',
    variantId: null,
    productName: 'Unverified Bolt Box',
    variantName: null,
    displayName: 'Unverified Bolt Box',
    sku: 'HRD-BLT-003',
    categoryId: 'cat-3',
    categoryName: 'Hardware',
    unitSymbol: 'boxes',
  };

  const itemsMap = new Map<string, ItemMetadataForReport>([
    [cottonMeta.itemKey, cottonMeta],
    [paperMeta.itemKey, paperMeta],
    [unknownMeta.itemKey, unknownMeta],
  ]);

  test('Cases 24-35: 5-day Daily Low-Stock History, Consolidated Low-Stock Report, carried-forward provenance, historical threshold preservation, and UNKNOWN exclusion', () => {
    /**
     * Exact scenario from Master Prompt Section 8:
     * Selected range: Nov 1 - Nov 5, 2026 (inclusive)
     * Cotton Fabric (Minimum = 20 m):
     * - Nov 1: Opening stock 25 m -> In stock (25 > 20)
     * - Nov 2: Physical count 18 m -> Low stock (18 <= 20), provenance: PHYSICAL_COUNT
     * - Nov 3: No event -> Carried forward 18 m -> Low stock (18 <= 20), provenance: CARRIED_FORWARD
     * - Nov 4: Stock inward +22 m -> 40 m -> In stock (40 > 20), provenance: CALCULATED_INWARD_ONLY
     * - Nov 5: Physical count 15 m -> Low stock (15 <= 20), provenance: PHYSICAL_COUNT
     */
    const cottonLedger = calculateLedgerState({
      workspaceId,
      itemKey: cottonMeta.itemKey,
      productId: cottonMeta.productId,
      currentThreshold: 20,
      events: [
        {
          id: 'c-1',
          eventType: 'OPENING_STOCK',
          quantity: 25,
          eventDate: '2026-11-01',
          sequenceNo: 1,
        },
        {
          id: 'c-2',
          eventType: 'PHYSICAL_COUNT',
          quantity: 18,
          eventDate: '2026-11-02',
          sequenceNo: 2,
        },
        {
          id: 'c-4',
          eventType: 'STOCK_INWARD',
          quantity: 22,
          eventDate: '2026-11-04',
          sequenceNo: 3,
        },
        {
          id: 'c-5',
          eventType: 'PHYSICAL_COUNT',
          quantity: 15,
          eventDate: '2026-11-05',
          sequenceNo: 4,
        },
      ],
    });

    const cottonSnapshots = buildDailyInventorySnapshots({
      workspaceId,
      itemKey: cottonMeta.itemKey,
      productId: cottonMeta.productId,
      startDate: '2026-11-01',
      endDate: '2026-11-05',
      events: cottonLedger.processedEvents,
      thresholdHistory: [
        {
          id: 'th-c-1',
          workspaceId,
          itemKey: cottonMeta.itemKey,
          productId: cottonMeta.productId,
          variantId: null,
          minStockThreshold: 20,
          effectiveFromDate: '2026-11-01',
          effectiveTimestamp: '2026-11-01T00:00:00.000Z',
          sequenceNo: 1,
          reason: 'Initial',
          createdAt: '2026-11-01T00:00:00.000Z',
        },
      ],
    });

    // A4 Paper (Threshold = 15 packs): low on Nov 2 (5 packs) and Nov 3 (5 packs carried forward), restocked Nov 4 (+20 = 25)
    const paperLedger = calculateLedgerState({
      workspaceId,
      itemKey: paperMeta.itemKey,
      productId: paperMeta.productId,
      currentThreshold: 15,
      events: [
        {
          id: 'p-1',
          eventType: 'OPENING_STOCK',
          quantity: 20,
          eventDate: '2026-11-01',
          sequenceNo: 1,
        },
        {
          id: 'p-2',
          eventType: 'PHYSICAL_COUNT',
          quantity: 5,
          eventDate: '2026-11-02',
          sequenceNo: 2,
        },
        {
          id: 'p-4',
          eventType: 'STOCK_INWARD',
          quantity: 20,
          eventDate: '2026-11-04',
          sequenceNo: 3,
        },
      ],
    });

    const paperSnapshots = buildDailyInventorySnapshots({
      workspaceId,
      itemKey: paperMeta.itemKey,
      productId: paperMeta.productId,
      startDate: '2026-11-01',
      endDate: '2026-11-05',
      events: paperLedger.processedEvents,
      thresholdHistory: [
        {
          id: 'th-p-1',
          workspaceId,
          itemKey: paperMeta.itemKey,
          productId: paperMeta.productId,
          variantId: null,
          minStockThreshold: 15,
          effectiveFromDate: '2026-11-01',
          effectiveTimestamp: '2026-11-01T00:00:00.000Z',
          sequenceNo: 1,
          reason: 'Initial',
          createdAt: '2026-11-01T00:00:00.000Z',
        },
      ],
    });

    // Case 34: UNKNOWN item with no baseline events
    const unknownSnapshots = buildDailyInventorySnapshots({
      workspaceId,
      itemKey: unknownMeta.itemKey,
      productId: unknownMeta.productId,
      startDate: '2026-11-01',
      endDate: '2026-11-05',
      events: [],
      thresholdHistory: [
        {
          id: 'th-u-1',
          workspaceId,
          itemKey: unknownMeta.itemKey,
          productId: unknownMeta.productId,
          variantId: null,
          minStockThreshold: 10,
          effectiveFromDate: '2026-11-01',
          effectiveTimestamp: '2026-11-01T00:00:00.000Z',
          sequenceNo: 1,
          reason: 'Initial',
          createdAt: '2026-11-01T00:00:00.000Z',
        },
      ],
    });

    const allSnapshots = [
      ...cottonSnapshots,
      ...paperSnapshots,
      ...unknownSnapshots,
    ];

    // Case 24, 25, 33, 34, 35: Generate Daily Low-Stock Report for 5-day inclusive range
    const dailyLowReport = generateDailyLowStockHistory({
      startDate: '2026-11-01',
      endDate: '2026-11-05',
      snapshots: allSnapshots,
      itemsMap,
      includeAllStatuses: false,
    });

    // Case 35: Verify date-range boundaries are inclusive (5 days: Nov 1..Nov 5)
    expect(dailyLowReport.days).toHaveLength(5);
    expect(dailyLowReport.days[0].date).toBe('2026-11-01');
    expect(dailyLowReport.days[4].date).toBe('2026-11-05');

    // Nov 1 had both items in stock and 1 UNKNOWN -> 0 low-stock entries
    expect(dailyLowReport.days[0].items).toHaveLength(0);

    // Nov 2 had Cotton Fabric (18 <= 20) and A4 Paper (5 <= 15)
    expect(dailyLowReport.days[1].items).toHaveLength(2);

    // Case 33: Verify Nov 3 carried-forward balances are marked CARRIED_FORWARD
    const nov3Cotton = dailyLowReport.days[2].items.find(
      (i) => i.itemKey === cottonMeta.itemKey
    );
    expect(nov3Cotton?.recordedQuantity).toBe(18);
    expect(nov3Cotton?.quantitySource).toBe('CARRIED_FORWARD');

    // Case 26-30: Generate Consolidated Low-Stock Report
    const consolidated = generateConsolidatedLowStockReport({
      startDate: '2026-11-01',
      endDate: '2026-11-05',
      snapshots: allSnapshots,
      itemsMap,
    });

    // Case 27 & 34: Each affected product appears ONCE; UNKNOWN product is NOT included
    expect(consolidated.items).toHaveLength(2);

    const cottonSummary = consolidated.items.find(
      (i) => i.itemKey === cottonMeta.itemKey
    )!;
    expect(cottonSummary).toBeDefined();
    // Case 28: Verify lowest recorded quantity (15 m on Nov 5)
    expect(cottonSummary.lowestRecordedQuantity).toBe(15);
    // Case 29: Verify number of low-stock days (Nov 2, Nov 3, Nov 5 = 3 days)
    expect(cottonSummary.lowStockDays).toBe(3);
    expect(cottonSummary.totalAffectedDays).toBe(3);
    // Case 30: Verify first and last low-stock dates
    expect(cottonSummary.firstLowStockDate).toBe('2026-11-02');
    expect(cottonSummary.lastLowStockDate).toBe('2026-11-05');

    const paperSummary = consolidated.items.find(
      (i) => i.itemKey === paperMeta.itemKey
    )!;
    expect(paperSummary.lowestRecordedQuantity).toBe(5);
    expect(paperSummary.lowStockDays).toBe(2);
    expect(paperSummary.firstLowStockDate).toBe('2026-11-02');
    expect(paperSummary.lastLowStockDate).toBe('2026-11-03');
  });

  test('Case 31: Changing threshold on Nov 5 preserves historical threshold on Nov 2', () => {
    const ledger = calculateLedgerState({
      workspaceId,
      itemKey: cottonMeta.itemKey,
      productId: cottonMeta.productId,
      currentThreshold: 30,
      events: [
        {
          id: 'ev-1',
          eventType: 'OPENING_STOCK',
          quantity: 25,
          eventDate: '2026-11-01',
          sequenceNo: 1,
        },
      ],
    });

    // On Nov 1..Nov 4 threshold was 20 (so 25 m was IN_STOCK).
    // On Nov 5 threshold was raised to 30 (so 25 m became LOW_STOCK on Nov 5 only).
    const snapshots = buildDailyInventorySnapshots({
      workspaceId,
      itemKey: cottonMeta.itemKey,
      productId: cottonMeta.productId,
      startDate: '2026-11-01',
      endDate: '2026-11-05',
      events: ledger.processedEvents,
      thresholdHistory: [
        {
          id: 'th-1',
          workspaceId,
          itemKey: cottonMeta.itemKey,
          productId: cottonMeta.productId,
          variantId: null,
          minStockThreshold: 20,
          effectiveFromDate: '2026-11-01',
          effectiveTimestamp: '2026-11-01T00:00:00.000Z',
          sequenceNo: 1,
          reason: 'Initial threshold',
          createdAt: '2026-11-01T00:00:00.000Z',
        },
        {
          id: 'th-2',
          workspaceId,
          itemKey: cottonMeta.itemKey,
          productId: cottonMeta.productId,
          variantId: null,
          minStockThreshold: 30,
          effectiveFromDate: '2026-11-05',
          effectiveTimestamp: '2026-11-05T09:00:00.000Z',
          sequenceNo: 2,
          reason: 'Raised threshold on Nov 5',
          createdAt: '2026-11-05T09:00:00.000Z',
        },
      ],
    });

    const nov2Snap = snapshots.find((s) => s.snapshotDate === '2026-11-02')!;
    expect(nov2Snap.minStockThreshold).toBe(20);
    expect(nov2Snap.stockStatus).toBe('IN_STOCK');

    const nov5Snap = snapshots.find((s) => s.snapshotDate === '2026-11-05')!;
    expect(nov5Snap.minStockThreshold).toBe(30);
    expect(nov5Snap.stockStatus).toBe('LOW_STOCK');
  });
});
