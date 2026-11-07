import {
  buildConsolidatedLowStockCsv,
  buildCurrentInventoryCsv,
  buildDailyLowStockCsv,
  buildHtmlReportForPdf,
} from '@/application/services/ReportExportService';
import {
  dateRangeFilterSchema,
  productCreateSchema,
} from '@/core/validation/schemas';
import fs from 'fs';
import path from 'path';

describe('Mobile Quality, Validation Schemas, Export Generators & Build Config (Mandatory Cases 52-57)', () => {
  test('Validation schemas enforce non-negative thresholds and inclusive date range order', () => {
    const invalidProd = productCreateSchema.safeParse({
      name: 'Sample Item',
      sku: 'SMP-001',
      categoryId: 'cat-1',
      unitId: 'unit-1',
      minStockThreshold: -1,
    });
    expect(invalidProd.success).toBe(false);

    const invalidRange = dateRangeFilterSchema.safeParse({
      startDate: '2026-11-10',
      endDate: '2026-11-05',
    });
    expect(invalidRange.success).toBe(false);

    const validRange = dateRangeFilterSchema.safeParse({
      startDate: '2026-11-01',
      endDate: '2026-11-05',
    });
    expect(validRange.success).toBe(true);
  });

  test('CSV and PDF HTML report generators include business name, provenance, and date ranges', () => {
    const mockBusiness = {
      id: 'ws-1',
      businessName: 'Kaveri Hardware & Electricals',
      businessType: 'Hardware & Tools',
      ownerName: 'Suresh',
      contactNumber: '9000011111',
      businessAddress: 'Chennai',
      country: 'India',
      dateFormat: 'DD/MM/YYYY' as const,
      timezone: 'Asia/Kolkata',
      defaultUnitId: 'u-1',
      appLockEnabled: false,
      appLockPin: null,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    };

    const csv = buildCurrentInventoryCsv(mockBusiness, [
      {
        itemKey: 'i-1',
        productId: 'p-1',
        variantId: null,
        productName: 'Copper Wire Coil',
        variantName: null,
        displayName: 'Copper Wire Coil',
        sku: 'WIR-COP-01',
        barcode: '890111222333',
        categoryId: 'c-1',
        categoryName: 'Electrical',
        categoryColor: '#2563EB',
        subcategoryId: null,
        unitId: 'u-1',
        unitName: 'Rolls',
        unitSymbol: 'rolls',
        allowFractional: true,
        supplierId: null,
        supplierName: null,
        recordedQuantity: 8,
        minStockThreshold: 15,
        reorderQuantity: 25,
        stockStatus: 'LOW_STOCK',
        quantityProvenance: 'PHYSICAL_COUNT',
        lastPhysicalCountDate: '2026-11-05',
        lastInwardDate: '2026-11-01',
        isArchived: false,
      },
    ]);

    expect(csv).toContain('Kaveri Hardware & Electricals');
    expect(csv).toContain('Verified Physical Count');
    expect(csv).toContain('Copper Wire Coil');

    const dailyCsv = buildDailyLowStockCsv(mockBusiness, {
      startDate: '2026-11-01',
      endDate: '2026-11-05',
      includeAllStatuses: false,
      totalMatchingEntries: 1,
      days: [
        {
          date: '2026-11-02',
          totalLowOrOutCount: 1,
          lowStockCount: 1,
          outOfStockCount: 0,
          items: [
            {
              snapshotDate: '2026-11-02',
              itemKey: 'i-1',
              productId: 'p-1',
              variantId: null,
              displayName: 'Copper Wire Coil',
              sku: 'WIR-COP-01',
              categoryId: 'c-1',
              categoryName: 'Electrical',
              unitSymbol: 'rolls',
              recordedQuantity: 8,
              minStockThreshold: 15,
              stockStatus: 'LOW_STOCK',
              quantitySource: 'PHYSICAL_COUNT',
              lastPhysicalCountDate: '2026-11-02',
            },
          ],
        },
      ],
    });
    expect(dailyCsv).toContain('2026-11-01 to 2026-11-05 (Inclusive)');

    const consCsv = buildConsolidatedLowStockCsv(mockBusiness, {
      startDate: '2026-11-01',
      endDate: '2026-11-05',
      items: [
        {
          itemKey: 'i-1',
          productId: 'p-1',
          variantId: null,
          displayName: 'Copper Wire Coil',
          sku: 'WIR-COP-01',
          categoryId: 'c-1',
          categoryName: 'Electrical',
          unitSymbol: 'rolls',
          applicableThreshold: 15,
          minApplicableThreshold: 15,
          maxApplicableThreshold: 15,
          lowestRecordedQuantity: 8,
          lowStockDays: 3,
          outOfStockDays: 0,
          totalAffectedDays: 3,
          firstLowStockDate: '2026-11-02',
          lastLowStockDate: '2026-11-05',
          latestQuantitySource: 'PHYSICAL_COUNT',
        },
      ],
    });
    expect(consCsv).toContain('Consolidated Low-Stock Report');

    const html = buildHtmlReportForPdf({
      business: mockBusiness,
      reportTitle: 'Daily Low-Stock Report',
      dateRangeLabel: '2026-11-01 to 2026-11-05',
      headers: ['Product', 'Qty'],
      rows: [['Copper Wire Coil', '8 rolls']],
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Quantity Provenance Note');
  });

  test('Cases 52-57: Verify mobile navigation routes, permissions, and EAS Android/iOS build configurations exist', () => {
    const rootDir = path.join(__dirname, '..', '..');
    const appJson = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'app.json'), 'utf8')
    );
    const easJson = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'eas.json'), 'utf8')
    );

    expect(appJson.expo.android.package).toBe('com.stockbeacon.inventory');
    expect(appJson.expo.ios.bundleIdentifier).toBe('com.stockbeacon.inventory');
    expect(appJson.expo.android.permissions).toContain(
      'android.permission.CAMERA'
    );
    expect(easJson.build.preview.android.buildType).toBe('apk');
    expect(easJson.build.production.android.buildType).toBe('app-bundle');

    // Verify all 5 bottom tab screens and modal routes exist
    const requiredScreens = [
      'src/app/_layout.tsx',
      'src/app/onboarding.tsx',
      'src/app/low-stock.tsx',
      'src/app/scanner.tsx',
      'src/app/suppliers.tsx',
      'src/app/notifications.tsx',
      'src/app/product/new.tsx',
      'src/app/product/[id].tsx',
      'src/app/(tabs)/_layout.tsx',
      'src/app/(tabs)/index.tsx',
      'src/app/(tabs)/products.tsx',
      'src/app/(tabs)/stock.tsx',
      'src/app/(tabs)/reports.tsx',
      'src/app/(tabs)/settings.tsx',
    ];

    for (const screenRelPath of requiredScreens) {
      expect(fs.existsSync(path.join(rootDir, screenRelPath))).toBe(true);
    }
  });
});
