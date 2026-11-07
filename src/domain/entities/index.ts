import {
  AlertState,
  DateFormatOption,
  NotificationType,
  QuantityProvenance,
  StockEventType,
  StockStatus,
} from '../enums';

export interface BusinessProfile {
  id: string;
  businessName: string;
  businessType: string;
  ownerName: string | null;
  contactNumber: string | null;
  businessAddress: string | null;
  country: string;
  dateFormat: DateFormatOption;
  timezone: string;
  defaultUnitId: string | null;
  appLockEnabled: boolean;
  appLockPin: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Warehouse {
  id: string;
  workspaceId: string;
  name: string;
  code: string;
  address: string | null;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  workspaceId: string;
  name: string;
  parentId: string | null;
  description: string | null;
  colorHex: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UnitOfMeasure {
  id: string;
  workspaceId: string;
  name: string;
  symbol: string;
  allowFractional: boolean;
  isCustom: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  workspaceId: string;
  name: string;
  contactNumber: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductAttribute {
  id: string;
  workspaceId: string;
  productId: string;
  attributeName: string;
  attributeOptions: string[];
  displayOrder: number;
  createdAt: string;
}

export interface ProductVariant {
  id: string;
  workspaceId: string;
  productId: string;
  variantName: string;
  attributeValues: Record<string, string>;
  displayOrder?: number;
  sku: string;
  barcode: string | null;
  minStockThreshold: number;
  reorderQuantity: number | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  workspaceId: string;
  name: string;
  sku: string;
  barcode: string | null;
  categoryId: string;
  subcategoryId: string | null;
  description: string | null;
  unitId: string;
  minStockThreshold: number;
  reorderQuantity: number | null;
  supplierId: string | null;
  imageUri: string | null;
  hasVariants: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockEvent {
  id: string;
  workspaceId: string;
  warehouseId: string | null;
  itemKey: string; // variantId ?? productId
  productId: string;
  variantId: string | null;
  eventType: StockEventType;
  quantity: number;
  previousBalance: number | null;
  resultingBalance: number;
  varianceQuantity: number | null;
  eventDate: string; // YYYY-MM-DD in business timezone
  eventTimestamp: string; // ISO-8601
  sequenceNo: number;
  supplierId: string | null;
  referenceNumber: string | null;
  reason: string | null;
  notes: string | null;
  createdAt: string;
}

export interface InventoryBalance {
  itemKey: string;
  workspaceId: string;
  productId: string;
  variantId: string | null;
  recordedQuantity: number | null;
  minStockThreshold: number;
  stockStatus: StockStatus;
  quantityProvenance: QuantityProvenance;
  lastPhysicalCountDate: string | null;
  lastPhysicalCountQty: number | null;
  lastInwardDate: string | null;
  lastEventId: string | null;
  activeAlertState: AlertState;
  updatedAt: string;
}

export interface ProductThresholdHistory {
  id: string;
  workspaceId: string;
  itemKey: string;
  productId: string;
  variantId: string | null;
  minStockThreshold: number;
  effectiveFromDate: string; // YYYY-MM-DD
  effectiveTimestamp: string;
  sequenceNo: number;
  reason: string | null;
  createdAt: string;
}

export interface DailyInventorySnapshot {
  id: string;
  workspaceId: string;
  itemKey: string;
  productId: string;
  variantId: string | null;
  snapshotDate: string; // YYYY-MM-DD
  recordedQuantity: number | null;
  minStockThreshold: number;
  stockStatus: StockStatus;
  quantitySource: QuantityProvenance;
  lastPhysicalCountDate: string | null;
  generatedAt: string;
}

export interface NotificationSettings {
  workspaceId: string;
  lowStockAlertsEnabled: boolean;
  outOfStockAlertsEnabled: boolean;
  dailyReminderEnabled: boolean;
  dailyReminderTime: string; // HH:mm
  dailySummaryEnabled: boolean;
  dailySummaryTime: string; // HH:mm
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  workspaceId: string;
  itemKey: string | null;
  productId: string | null;
  variantId: string | null;
  notificationType: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  workspaceId: string;
  actionType: string;
  entityType: string;
  entityId: string;
  summary: string;
  metadataJson: string | null;
  createdAt: string;
}

/**
 * Enriched Inventory Item View used across Product Catalog, Low-Stock Register,
 * Physical Count Sheets, and Historical Reports.
 */
export interface InventoryItemView {
  itemKey: string;
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  attributeValues?: Record<string, string>;
  variantSortOrder?: number;
  productCreatedAt?: string;
  displayName: string; // e.g., "Cotton Shirt (Small / Blue)" or "A4 Paper"
  sku: string;
  barcode: string | null;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  subcategoryId: string | null;
  unitId: string;
  unitName: string;
  unitSymbol: string;
  allowFractional: boolean;
  supplierId: string | null;
  supplierName: string | null;
  recordedQuantity: number | null;
  minStockThreshold: number;
  reorderQuantity: number | null;
  stockStatus: StockStatus;
  quantityProvenance: QuantityProvenance;
  lastPhysicalCountDate: string | null;
  lastInwardDate: string | null;
  isArchived: boolean;
}
