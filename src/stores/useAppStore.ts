import { BackupRestoreService } from '@/application/services/BackupRestoreService';
import { DeviceNotificationService } from '@/application/services/DeviceNotificationService';
import { getTodayInTimezone } from '@/core/utils/dateUtils';
import { getDatabase } from '@/data/database/DatabaseConnection';
import {
  CreateProductInput,
  ProductDetailBundle,
  SqliteCatalogRepository,
} from '@/data/repositories/SqliteCatalogRepository';
import {
  StockEventWithDetails,
  SqliteInventoryRepository,
} from '@/data/repositories/SqliteInventoryRepository';
import {
  CreateBusinessProfileInput,
  SqliteWorkspaceRepository,
} from '@/data/repositories/SqliteWorkspaceRepository';
import {
  AppNotification,
  BusinessProfile,
  Category,
  InventoryItemView,
  NotificationSettings,
  Supplier,
  UnitOfMeasure,
} from '@/domain/entities';
import { applyThemePalette, ThemeMode } from '@/theme';
import { create } from 'zustand';

interface AppStoreState {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  themeMode: ThemeMode;
  isDarkMode: boolean;
  profile: BusinessProfile | null;
  categories: Category[];
  units: UnitOfMeasure[];
  suppliers: Supplier[];
  inventoryItems: InventoryItemView[];
  recentEvents: StockEventWithDetails[];
  notifications: AppNotification[];
  notificationSettings: NotificationSettings | null;

  initializeApp: () => Promise<void>;
  refreshAll: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  toggleLightDark: () => Promise<void>;
  completeOnboarding: (input: CreateBusinessProfileInput) => Promise<void>;
  updateBusinessProfile: (
    updates: Partial<BusinessProfile>
  ) => Promise<void>;

  // Catalog actions
  addCategory: (params: {
    name: string;
    description?: string;
    colorHex?: string;
  }) => Promise<Category>;
  updateCategory: (
    id: string,
    updates: {
      name?: string;
      description?: string | null;
      colorHex?: string;
    }
  ) => Promise<void>;
  removeCategory: (params: {
    categoryId: string;
    reassignToCategoryId?: string | null;
  }) => Promise<void>;
  addUnit: (params: {
    name: string;
    symbol: string;
    allowFractional: boolean;
  }) => Promise<UnitOfMeasure>;
  addSupplier: (params: {
    name: string;
    contactNumber?: string;
    email?: string;
    address?: string;
    notes?: string;
  }) => Promise<Supplier>;
  updateSupplier: (
    id: string,
    updates: Partial<Supplier>
  ) => Promise<void>;
  createProduct: (
    input: Omit<CreateProductInput, 'workspaceId'>
  ) => Promise<ProductDetailBundle>;
  updateProduct: (params: {
    productId: string;
    name?: string;
    sku?: string;
    barcode?: string | null;
    categoryId?: string;
    description?: string | null;
    unitId?: string;
    minStockThreshold?: number;
    reorderQuantity?: number | null;
    supplierId?: string | null;
    effectiveDate?: string;
  }) => Promise<ProductDetailBundle>;
  setProductArchived: (productId: string, isArchived: boolean) => Promise<void>;
  getProductDetail: (productId: string) => Promise<ProductDetailBundle | null>;

  // Inventory actions
  recordStockInward: (params: {
    itemKey: string;
    productId: string;
    variantId?: string | null;
    quantity: number;
    eventDate: string;
    supplierId?: string | null;
    referenceNumber?: string | null;
    notes?: string | null;
  }) => Promise<void>;
  recordBatchPhysicalCount: (params: {
    eventDate: string;
    sessionNotes?: string | null;
    entries: {
      itemKey: string;
      productId: string;
      variantId?: string | null;
      countedQuantity: number;
      notes?: string | null;
    }[];
  }) => Promise<void>;
  recordOpeningStock: (params: {
    itemKey: string;
    productId: string;
    variantId?: string | null;
    quantity: number;
    eventDate: string;
    notes?: string | null;
  }) => Promise<void>;
  recordStockAdjustment: (params: {
    itemKey: string;
    productId: string;
    variantId?: string | null;
    quantityDelta: number;
    reason: string;
    eventDate: string;
    notes?: string | null;
  }) => Promise<void>;
  updateMinimumThreshold: (params: {
    itemKey: string;
    productId: string;
    variantId?: string | null;
    newThreshold: number;
    effectiveDate?: string;
    reason?: string;
  }) => Promise<void>;

  // Notifications & Backup
  markAllNotificationsRead: () => Promise<void>;
  updateNotificationSettings: (
    updates: Partial<NotificationSettings>
  ) => Promise<void>;
  createBackupJson: () => Promise<string>;
  restoreBackupJson: (jsonString: string) => Promise<void>;
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  isInitialized: false,
  isLoading: false,
  error: null,
  themeMode: 'light',
  isDarkMode: false,
  profile: null,
  categories: [],
  units: [],
  suppliers: [],
  inventoryItems: [],
  recentEvents: [],
  notifications: [],
  notificationSettings: null,

  initializeApp: async () => {
    set({ isLoading: true, error: null });
    try {
      const db = await getDatabase();
      const workspaceRepo = new SqliteWorkspaceRepository(db);
      const profile = await workspaceRepo.getActiveProfile();

      if (!profile) {
        applyThemePalette('light');
        set({
          profile: null,
          themeMode: 'light',
          isDarkMode: false,
          isInitialized: true,
          isLoading: false,
        });
        return;
      }

      const savedTheme: ThemeMode =
        profile.appLockPin === 'dark' ||
        profile.appLockPin === 'light' ||
        profile.appLockPin === 'system'
          ? profile.appLockPin
          : 'light';
      const isDark = applyThemePalette(savedTheme);

      set({ profile, themeMode: savedTheme, isDarkMode: isDark });
      await get().refreshAll();
      set({ isInitialized: true, isLoading: false });
    } catch (err) {
      set({
        error: (err as Error).message,
        isInitialized: true,
        isLoading: false,
      });
    }
  },

  setThemeMode: async (mode: ThemeMode) => {
    const isDark = applyThemePalette(mode);
    set({ themeMode: mode, isDarkMode: isDark });
    const profile = get().profile;
    if (profile) {
      try {
        const db = await getDatabase();
        const workspaceRepo = new SqliteWorkspaceRepository(db);
        const updated = await workspaceRepo.updateProfile(profile.id, {
          appLockPin: mode,
        });
        set({ profile: updated, themeMode: mode, isDarkMode: isDark });
      } catch {
        // Keep in-memory theme state even if DB write is busy
      }
    }
  },

  toggleLightDark: async () => {
    const nextMode: ThemeMode = get().isDarkMode ? 'light' : 'dark';
    await get().setThemeMode(nextMode);
  },

  refreshAll: async () => {
    const db = await getDatabase();
    const workspaceRepo = new SqliteWorkspaceRepository(db);
    const inventoryRepo = new SqliteInventoryRepository(db);
    const catalogRepo = new SqliteCatalogRepository(db, inventoryRepo);

    const profile = await workspaceRepo.getActiveProfile();
    if (!profile) {
      set({
        profile: null,
        categories: [],
        units: [],
        suppliers: [],
        inventoryItems: [],
        recentEvents: [],
        notifications: [],
        notificationSettings: null,
      });
      return;
    }

    const [
      categories,
      units,
      suppliers,
      inventoryItems,
      recentEvents,
      notifications,
      notificationSettings,
    ] = await Promise.all([
      catalogRepo.listCategories(profile.id, false),
      catalogRepo.listUnits(profile.id, false),
      catalogRepo.listSuppliers(profile.id, false),
      catalogRepo.listInventoryItems({
        workspaceId: profile.id,
        includeArchived: false,
      }),
      inventoryRepo.listStockEvents({
        workspaceId: profile.id,
        limit: 100,
      }),
      workspaceRepo.listNotifications(profile.id, 100),
      workspaceRepo.getNotificationSettings(profile.id),
    ]);

    set({
      profile,
      categories,
      units,
      suppliers,
      inventoryItems,
      recentEvents,
      notifications,
      notificationSettings,
    });
  },

  completeOnboarding: async (input) => {
    set({ isLoading: true, error: null });
    try {
      const db = await getDatabase();
      const workspaceRepo = new SqliteWorkspaceRepository(db);
      const profile = await workspaceRepo.createProfileWithDefaults(input);
      set({ profile });
      await get().refreshAll();
      set({ isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: (err as Error).message });
      throw err;
    }
  },

  updateBusinessProfile: async (updates) => {
    const profile = get().profile;
    if (!profile) throw new Error('No active workspace');
    const db = await getDatabase();
    const workspaceRepo = new SqliteWorkspaceRepository(db);
    await workspaceRepo.updateProfile(profile.id, updates);
    await get().refreshAll();
  },

  addCategory: async (params) => {
    const profile = get().profile;
    if (!profile) throw new Error('No active workspace');
    const db = await getDatabase();
    const inventoryRepo = new SqliteInventoryRepository(db);
    const catalogRepo = new SqliteCatalogRepository(db, inventoryRepo);
    const cat = await catalogRepo.createCategory({
      workspaceId: profile.id,
      ...params,
    });
    await get().refreshAll();
    return cat;
  },

  updateCategory: async (id, updates) => {
    const db = await getDatabase();
    const inventoryRepo = new SqliteInventoryRepository(db);
    const catalogRepo = new SqliteCatalogRepository(db, inventoryRepo);
    await catalogRepo.updateCategory(id, updates);
    await get().refreshAll();
  },

  removeCategory: async (params) => {
    const profile = get().profile;
    if (!profile) throw new Error('No active workspace');
    const db = await getDatabase();
    const inventoryRepo = new SqliteInventoryRepository(db);
    const catalogRepo = new SqliteCatalogRepository(db, inventoryRepo);
    await catalogRepo.deleteOrRemoveCategory({
      workspaceId: profile.id,
      categoryId: params.categoryId,
      reassignToCategoryId: params.reassignToCategoryId,
    });
    await get().refreshAll();
  },

  addUnit: async (params) => {
    const profile = get().profile;
    if (!profile) throw new Error('No active workspace');
    const db = await getDatabase();
    const inventoryRepo = new SqliteInventoryRepository(db);
    const catalogRepo = new SqliteCatalogRepository(db, inventoryRepo);
    const unit = await catalogRepo.createUnit({
      workspaceId: profile.id,
      ...params,
    });
    await get().refreshAll();
    return unit;
  },

  addSupplier: async (params) => {
    const profile = get().profile;
    if (!profile) throw new Error('No active workspace');
    const db = await getDatabase();
    const inventoryRepo = new SqliteInventoryRepository(db);
    const catalogRepo = new SqliteCatalogRepository(db, inventoryRepo);
    const supplier = await catalogRepo.createSupplier({
      workspaceId: profile.id,
      ...params,
    });
    await get().refreshAll();
    return supplier;
  },

  updateSupplier: async (id, updates) => {
    const db = await getDatabase();
    const inventoryRepo = new SqliteInventoryRepository(db);
    const catalogRepo = new SqliteCatalogRepository(db, inventoryRepo);
    await catalogRepo.updateSupplier(id, updates);
    await get().refreshAll();
  },

  createProduct: async (input) => {
    const profile = get().profile;
    if (!profile) throw new Error('No active workspace');
    const db = await getDatabase();
    const inventoryRepo = new SqliteInventoryRepository(db);
    const catalogRepo = new SqliteCatalogRepository(db, inventoryRepo);
    const detail = await catalogRepo.createProduct({
      ...input,
      workspaceId: profile.id,
      openingStockDate:
        input.openingStockDate || getTodayInTimezone(profile.timezone),
    });
    await get().refreshAll();
    return detail;
  },

  updateProduct: async (params) => {
    const profile = get().profile;
    if (!profile) throw new Error('No active workspace');
    const db = await getDatabase();
    const inventoryRepo = new SqliteInventoryRepository(db);
    const catalogRepo = new SqliteCatalogRepository(db, inventoryRepo);
    const detail = await catalogRepo.updateProduct({
      ...params,
      workspaceId: profile.id,
      effectiveDate:
        params.effectiveDate || getTodayInTimezone(profile.timezone),
    });
    await get().refreshAll();
    return detail;
  },

  setProductArchived: async (productId, isArchived) => {
    const profile = get().profile;
    if (!profile) throw new Error('No active workspace');
    const db = await getDatabase();
    const inventoryRepo = new SqliteInventoryRepository(db);
    const catalogRepo = new SqliteCatalogRepository(db, inventoryRepo);
    await catalogRepo.setProductArchived(profile.id, productId, isArchived);
    await get().refreshAll();
  },

  getProductDetail: async (productId) => {
    const profile = get().profile;
    if (!profile) return null;
    const db = await getDatabase();
    const inventoryRepo = new SqliteInventoryRepository(db);
    const catalogRepo = new SqliteCatalogRepository(db, inventoryRepo);
    return await catalogRepo.getProductDetail(profile.id, productId);
  },

  recordStockInward: async (params) => {
    const profile = get().profile;
    if (!profile) throw new Error('No active workspace');
    const db = await getDatabase();
    const inventoryRepo = new SqliteInventoryRepository(db);
    const res = await inventoryRepo.recordStockInward({
      workspaceId: profile.id,
      ...params,
    });
    await DeviceNotificationService.dispatchLocalAlert(res.emittedNotification);
    await get().refreshAll();
  },

  recordBatchPhysicalCount: async (params) => {
    const profile = get().profile;
    if (!profile) throw new Error('No active workspace');
    const db = await getDatabase();
    const inventoryRepo = new SqliteInventoryRepository(db);
    const res = await inventoryRepo.recordBatchPhysicalCount({
      workspaceId: profile.id,
      ...params,
    });
    for (const r of res.results) {
      await DeviceNotificationService.dispatchLocalAlert(r.emittedNotification);
    }
    await get().refreshAll();
  },

  recordOpeningStock: async (params) => {
    const profile = get().profile;
    if (!profile) throw new Error('No active workspace');
    const db = await getDatabase();
    const inventoryRepo = new SqliteInventoryRepository(db);
    const res = await inventoryRepo.recordOpeningStock({
      workspaceId: profile.id,
      ...params,
    });
    await DeviceNotificationService.dispatchLocalAlert(res.emittedNotification);
    await get().refreshAll();
  },

  recordStockAdjustment: async (params) => {
    const profile = get().profile;
    if (!profile) throw new Error('No active workspace');
    const db = await getDatabase();
    const inventoryRepo = new SqliteInventoryRepository(db);
    const res = await inventoryRepo.recordStockAdjustment({
      workspaceId: profile.id,
      ...params,
    });
    await DeviceNotificationService.dispatchLocalAlert(res.emittedNotification);
    await get().refreshAll();
  },

  updateMinimumThreshold: async (params) => {
    const profile = get().profile;
    if (!profile) throw new Error('No active workspace');
    const db = await getDatabase();
    const inventoryRepo = new SqliteInventoryRepository(db);
    const res = await inventoryRepo.updateMinimumThreshold({
      workspaceId: profile.id,
      itemKey: params.itemKey,
      productId: params.productId,
      variantId: params.variantId,
      newThreshold: params.newThreshold,
      effectiveDate:
        params.effectiveDate || getTodayInTimezone(profile.timezone),
      reason: params.reason,
    });
    await DeviceNotificationService.dispatchLocalAlert(res.emittedNotification);
    await get().refreshAll();
  },

  markAllNotificationsRead: async () => {
    const profile = get().profile;
    if (!profile) return;
    const db = await getDatabase();
    const workspaceRepo = new SqliteWorkspaceRepository(db);
    await workspaceRepo.markAllNotificationsRead(profile.id);
    await get().refreshAll();
  },

  updateNotificationSettings: async (updates) => {
    const profile = get().profile;
    if (!profile) return;
    const db = await getDatabase();
    const workspaceRepo = new SqliteWorkspaceRepository(db);
    const updated = await workspaceRepo.updateNotificationSettings(
      profile.id,
      updates
    );
    const lowStockCount = get().inventoryItems.filter(
      (i) => i.stockStatus === 'LOW_STOCK' || i.stockStatus === 'OUT_OF_STOCK'
    ).length;
    await DeviceNotificationService.syncScheduledReminders(
      updated,
      lowStockCount
    );
    await get().refreshAll();
  },

  createBackupJson: async () => {
    const profile = get().profile;
    if (!profile) throw new Error('No active workspace');
    const db = await getDatabase();
    const backupService = new BackupRestoreService(db);
    const bundle = await backupService.createBackupBundle(profile.id);
    return JSON.stringify(bundle, null, 2);
  },

  restoreBackupJson: async (jsonString) => {
    const db = await getDatabase();
    const backupService = new BackupRestoreService(db);
    await backupService.restoreFromJson(jsonString);
    await get().refreshAll();
  },
}));
