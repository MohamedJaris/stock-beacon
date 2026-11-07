import { BackupRestoreService } from '@/application/services/BackupRestoreService';
import { SqliteCatalogRepository } from '@/data/repositories/SqliteCatalogRepository';
import { SqliteInventoryRepository } from '@/data/repositories/SqliteInventoryRepository';
import { SqliteWorkspaceRepository } from '@/data/repositories/SqliteWorkspaceRepository';
import { SqlJsTestAdapter } from '../helpers/SqlJsTestAdapter';

describe('Full SQLite Integration Suite: Product Mgmt, Backdated Snapshots, Persistence & Backup/Restore (Cases 1-6, 32, 36-51)', () => {
  test('Cases 1-6: Product CRUD, optional fields, duplicate SKU rejection, negative threshold rejection, archival with history preservation, and independent variants', async () => {
    const db = await SqlJsTestAdapter.createMigratedInstance();
    const workspaceRepo = new SqliteWorkspaceRepository(db);
    const inventoryRepo = new SqliteInventoryRepository(db);
    const catalogRepo = new SqliteCatalogRepository(db, inventoryRepo);

    // Case 37: Create a local business profile
    const profile = await workspaceRepo.createProfileWithDefaults({
      businessName: 'Apex Textile & Stationery Mart',
      businessType: 'Textile & Apparel',
      ownerName: 'Anand V',
      contactNumber: '+91 9876500001',
      businessAddress: '42 Bazaar Street',
      country: 'India',
      dateFormat: 'DD/MM/YYYY',
      timezone: 'Asia/Kolkata',
      defaultUnitSymbol: 'pcs',
    });

    const categories = await catalogRepo.listCategories(profile.id);
    const units = await catalogRepo.listUnits(profile.id);
    const defaultCategory = categories[0];
    const pcsUnit = units.find((u) => u.symbol === 'pcs')!;

    // Case 1: Create a product with valid details (and opening stock of 100)
    const prod1 = await catalogRepo.createProduct({
      workspaceId: profile.id,
      name: 'Executive Notebook',
      sku: 'NB-EXEC-001',
      barcode: '8901234560001',
      categoryId: defaultCategory.id,
      description: 'Hardbound 200 pages',
      unitId: pcsUnit.id,
      minStockThreshold: 20,
      openingStock: 100,
      openingStockDate: '2026-11-01',
      reorderQuantity: 50,
    });
    expect(prod1.product.name).toBe('Executive Notebook');
    expect(prod1.items[0].recordedQuantity).toBe(100);
    expect(prod1.items[0].stockStatus).toBe('IN_STOCK');

    // Case 2: Create a product without optional fields (no opening stock -> UNKNOWN)
    const prod2 = await catalogRepo.createProduct({
      workspaceId: profile.id,
      name: 'Unverified Brass Hinge',
      sku: 'HNG-BRS-002',
      categoryId: defaultCategory.id,
      unitId: pcsUnit.id,
      minStockThreshold: 15,
      openingStock: null,
    });
    expect(prod2.items[0].recordedQuantity).toBeNull();
    expect(prod2.items[0].stockStatus).toBe('UNKNOWN');

    // Case 3: Reject duplicate SKUs
    await expect(
      catalogRepo.createProduct({
        workspaceId: profile.id,
        name: 'Duplicate SKU Item',
        sku: 'NB-EXEC-001',
        categoryId: defaultCategory.id,
        unitId: pcsUnit.id,
        minStockThreshold: 10,
      })
    ).rejects.toThrow(/already in use/i);

    // Case 4: Reject invalid minimum thresholds (negative)
    await expect(
      catalogRepo.createProduct({
        workspaceId: profile.id,
        name: 'Negative Threshold Item',
        sku: 'NEG-THR-003',
        categoryId: defaultCategory.id,
        unitId: pcsUnit.id,
        minStockThreshold: -5,
      })
    ).rejects.toThrow(/zero or greater/i);

    // Case 5: Archive a product with transaction history without losing its history
    await inventoryRepo.recordStockInward({
      workspaceId: profile.id,
      itemKey: prod1.product.id,
      productId: prod1.product.id,
      quantity: 25,
      eventDate: '2026-11-02',
    });
    await catalogRepo.setProductArchived(profile.id, prod1.product.id, true);

    const activeOnly = await catalogRepo.listInventoryItems({
      workspaceId: profile.id,
      includeArchived: false,
    });
    expect(activeOnly.some((i) => i.productId === prod1.product.id)).toBe(false);

    const archivedEvents = await inventoryRepo.listStockEvents({
      workspaceId: profile.id,
      itemKey: prod1.product.id,
    });
    expect(archivedEvents).toHaveLength(2); // OPENING_STOCK + STOCK_INWARD preserved!

    // Restore prod1 back to active
    await catalogRepo.setProductArchived(profile.id, prod1.product.id, false);

    // Case 6: Create product variants with independently maintained stock quantities
    const shirtProduct = await catalogRepo.createProduct({
      workspaceId: profile.id,
      name: 'Cotton Shirt',
      sku: 'SHIRT-COT-BASE',
      categoryId: defaultCategory.id,
      unitId: pcsUnit.id,
      minStockThreshold: 10,
      hasVariants: true,
      attributes: [
        { attributeName: 'Size', attributeOptions: ['Small', 'Medium'] },
        { attributeName: 'Colour', attributeOptions: ['Blue', 'Black'] },
      ],
      variants: [
        {
          variantName: 'Small / Blue',
          attributeValues: { Size: 'Small', Colour: 'Blue' },
          sku: 'SHIRT-SM-BLU',
          minStockThreshold: 10,
          openingStock: 30,
        },
        {
          variantName: 'Medium / Black',
          attributeValues: { Size: 'Medium', Colour: 'Black' },
          sku: 'SHIRT-MD-BLK',
          minStockThreshold: 10,
          openingStock: 8,
        },
      ],
      openingStockDate: '2026-11-01',
    });

    expect(shirtProduct.items).toHaveLength(2);
    const smallBlue = shirtProduct.items.find((v) => v.sku === 'SHIRT-SM-BLU')!;
    const mediumBlack = shirtProduct.items.find((v) => v.sku === 'SHIRT-MD-BLK')!;
    expect(smallBlue.recordedQuantity).toBe(30);
    expect(smallBlue.stockStatus).toBe('IN_STOCK');
    expect(mediumBlack.recordedQuantity).toBe(8);
    expect(mediumBlack.stockStatus).toBe('LOW_STOCK');

    // Record inward on Medium / Black only and verify Small / Blue is untouched
    await inventoryRepo.recordStockInward({
      workspaceId: profile.id,
      itemKey: mediumBlack.itemKey,
      productId: shirtProduct.product.id,
      variantId: mediumBlack.variantId,
      quantity: 12,
      eventDate: '2026-11-02',
    });

    const refreshedShirt = await catalogRepo.getProductDetail(
      profile.id,
      shirtProduct.product.id
    );
    const refreshedSmall = refreshedShirt!.items.find(
      (v) => v.sku === 'SHIRT-SM-BLU'
    )!;
    const refreshedMedium = refreshedShirt!.items.find(
      (v) => v.sku === 'SHIRT-MD-BLK'
    )!;
    expect(refreshedSmall.recordedQuantity).toBe(30);
    expect(refreshedMedium.recordedQuantity).toBe(20);
    expect(refreshedMedium.stockStatus).toBe('IN_STOCK');

    // Verify that when creating variants with sizes S, M, L, XL, XXL, the default listInventoryItems()
    // preserves the exact input size sequence (S -> M -> L -> XL -> XXL) instead of sorting alphabetically (L -> M -> S -> XL -> XXL)!
    const dressProduct = await catalogRepo.createProduct({
      workspaceId: profile.id,
      name: 'Floral Ready-Made Dress',
      sku: 'DRESS-FLR-BASE',
      categoryId: defaultCategory.id,
      unitId: pcsUnit.id,
      minStockThreshold: 5,
      hasVariants: true,
      attributes: [
        {
          attributeName: 'Size',
          attributeOptions: ['S', 'M', 'L', 'XL', 'XXL'],
        },
      ],
      variants: ['S', 'M', 'L', 'XL', 'XXL'].map((sz, idx) => ({
        variantName: sz,
        attributeValues: { Size: sz },
        sku: `DRESS-FLR-${sz}-${idx}`,
        minStockThreshold: 5,
        openingStock: 10,
      })),
      openingStockDate: '2026-11-01',
    });

    expect(dressProduct.items.map((i) => i.variantName)).toEqual([
      'S',
      'M',
      'L',
      'XL',
      'XXL',
    ]);

    // Also verify that explicit sortBy: 'name' sorts them alphabetically when requested by the user
    const alphaItems = await catalogRepo.listInventoryItems({
      workspaceId: profile.id,
      sortBy: 'name',
    });
    const alphaDressSizes = alphaItems
      .filter((i) => i.productId === dressProduct.product.id)
      .map((i) => i.variantName);
    expect(alphaDressSizes).toEqual(['L', 'M', 'S', 'XL', 'XXL']);

    // Verify editing and removing categories works cleanly
    const customCat = await catalogRepo.createCategory({
      workspaceId: profile.id,
      name: 'Temporary Category',
      description: 'To be edited and removed',
    });
    await catalogRepo.updateCategory(customCat.id, {
      name: 'Nighties & Loungewear',
      description: 'Elastic, Zip, and Button nighties',
    });
    const updatedCats = await catalogRepo.listCategories(profile.id);
    expect(
      updatedCats.some((c) => c.name === 'Nighties & Loungewear')
    ).toBe(true);

    await catalogRepo.deleteOrRemoveCategory({
      workspaceId: profile.id,
      categoryId: customCat.id,
    });
    const afterDeleteCats = await catalogRepo.listCategories(profile.id);
    expect(afterDeleteCats.some((c) => c.id === customCat.id)).toBe(false);
  });

  test('Case 32 & Cases 36-51: Backdated snapshot recalculation, offline persistence across restarts, and full Backup & Restore with corruption rejection', async () => {
    const db1 = await SqlJsTestAdapter.createMigratedInstance();
    const wsRepo1 = new SqliteWorkspaceRepository(db1);
    const invRepo1 = new SqliteInventoryRepository(db1);
    const catRepo1 = new SqliteCatalogRepository(db1, invRepo1);

    const profile = await wsRepo1.createProfileWithDefaults({
      businessName: 'Sunrise General Traders',
      businessType: 'Grocery & Provisions',
      country: 'India',
      dateFormat: 'DD/MM/YYYY',
      timezone: 'Asia/Kolkata',
      defaultUnitSymbol: 'kg',
    });

    const cats = await catRepo1.listCategories(profile.id);
    const units = await catRepo1.listUnits(profile.id);
    const kgUnit = units.find((u) => u.symbol === 'kg')!;

    // Create product on 2026-11-01 with opening stock 15 kg (Threshold = 20 kg -> LOW_STOCK)
    const rice = await catRepo1.createProduct({
      workspaceId: profile.id,
      name: 'Basmati Rice Premium',
      sku: 'RICE-BSM-001',
      categoryId: cats[0].id,
      unitId: kgUnit.id,
      minStockThreshold: 20,
      openingStock: 15,
      openingStockDate: '2026-11-01',
    });

    // Verify Nov 1..Nov 3 shows 15 kg (LOW_STOCK)
    const reportBeforeBackdate = await invRepo1.getDailyLowStockHistoryReport({
      workspaceId: profile.id,
      startDate: '2026-11-01',
      endDate: '2026-11-03',
    });
    expect(reportBeforeBackdate.days[1].items[0].recordedQuantity).toBe(15);

    // Case 32: Record a backdated inward transaction on 2026-11-02 (+10 kg -> 25 kg)
    // and verify snapshots for 2026-11-02 and 2026-11-03 are recalculated to 25 kg (IN_STOCK)
    await invRepo1.recordStockInward({
      workspaceId: profile.id,
      itemKey: rice.product.id,
      productId: rice.product.id,
      quantity: 10,
      eventDate: '2026-11-02',
    });

    const reportAfterBackdate = await invRepo1.getDailyLowStockHistoryReport({
      workspaceId: profile.id,
      startDate: '2026-11-01',
      endDate: '2026-11-03',
      includeAllStatuses: true,
    });
    expect(reportAfterBackdate.days[0].items[0].recordedQuantity).toBe(15);
    expect(reportAfterBackdate.days[0].items[0].stockStatus).toBe('LOW_STOCK');
    expect(reportAfterBackdate.days[1].items[0].recordedQuantity).toBe(25);
    expect(reportAfterBackdate.days[1].items[0].stockStatus).toBe('IN_STOCK');
    expect(reportAfterBackdate.days[2].items[0].recordedQuantity).toBe(25);
    expect(reportAfterBackdate.days[2].items[0].quantitySource).toBe(
      'CARRIED_FORWARD'
    );

    // Cases 42-44: Simulate closing the application and reopening from persisted SQLite binary
    const binarySnapshot = db1.exportBinary();
    const reopenedDb = await SqlJsTestAdapter.createMigratedInstance(
      binarySnapshot
    );
    const reopenedCatRepo = new SqliteCatalogRepository(
      reopenedDb,
      new SqliteInventoryRepository(reopenedDb)
    );
    const itemsAfterRestart = await reopenedCatRepo.listInventoryItems({
      workspaceId: profile.id,
    });
    expect(itemsAfterRestart).toHaveLength(1);
    expect(itemsAfterRestart[0].recordedQuantity).toBe(25);

    // Cases 45-51: Create a backup, reject corrupted backup safely, and restore into a brand-new clean installation
    const backupService1 = new BackupRestoreService(reopenedDb);
    const backupBundle = await backupService1.createBackupBundle(profile.id);
    const backupJson = JSON.stringify(backupBundle);

    // Case 51: Reject a corrupted backup safely (tampered checksum / malformed JSON)
    const cleanDb = await SqlJsTestAdapter.createMigratedInstance();
    const cleanBackupService = new BackupRestoreService(cleanDb);

    const tamperedJson = backupJson.replace(
      'Basmati Rice Premium',
      'Tampered Rice'
    );
    const validationTampered = cleanBackupService.validateBackupJson(
      tamperedJson
    );
    expect(validationTampered.isValid).toBe(false);
    expect(validationTampered.error).toMatch(/checksum mismatch/i);

    await expect(
      cleanBackupService.restoreFromJson('{corrupted_json')
    ).rejects.toThrow(/Corrupted JSON/i);

    // Case 46-50: Restore valid backup into clean installation and verify products, events, thresholds, reports, and settings
    await cleanBackupService.restoreFromJson(backupJson);

    const cleanWsRepo = new SqliteWorkspaceRepository(cleanDb);
    const cleanInvRepo = new SqliteInventoryRepository(cleanDb);
    const cleanCatRepo = new SqliteCatalogRepository(cleanDb, cleanInvRepo);

    const restoredProfile = await cleanWsRepo.getActiveProfile();
    expect(restoredProfile?.businessName).toBe('Sunrise General Traders');

    const restoredItems = await cleanCatRepo.listInventoryItems({
      workspaceId: profile.id,
    });
    expect(restoredItems).toHaveLength(1);
    expect(restoredItems[0].displayName).toBe('Basmati Rice Premium');
    expect(restoredItems[0].recordedQuantity).toBe(25);

    const restoredEvents = await cleanInvRepo.listStockEvents({
      workspaceId: profile.id,
    });
    expect(restoredEvents).toHaveLength(2);

    const restoredSettings = await cleanWsRepo.getNotificationSettings(
      profile.id
    );
    expect(restoredSettings.lowStockAlertsEnabled).toBe(true);
  });
});
