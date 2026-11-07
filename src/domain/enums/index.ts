export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN';

export type StockEventType =
  | 'OPENING_STOCK'
  | 'STOCK_INWARD'
  | 'PHYSICAL_COUNT'
  | 'STOCK_ADJUSTMENT';

export type QuantityProvenance =
  | 'PHYSICAL_COUNT'
  | 'CALCULATED_INWARD_ONLY'
  | 'CARRIED_FORWARD'
  | 'UNKNOWN';

export type AlertState = 'NONE' | 'LOW_STOCK_ALERTED' | 'OUT_OF_STOCK_ALERTED';

export type NotificationType =
  | 'LOW_STOCK_ALERT'
  | 'OUT_OF_STOCK_ALERT'
  | 'DAILY_COUNT_REMINDER'
  | 'DAILY_LOW_STOCK_SUMMARY'
  | 'SYSTEM_BACKUP';

export type DateFormatOption = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

export const BUSINESS_TYPE_PRESETS = [
  'Textile & Apparel',
  'Stationery & Books',
  'Grocery & Provisions',
  'Hardware & Tools',
  'Electrical & Lighting',
  'Electronics & Mobile',
  'Wholesale & Distribution',
  'General Retail',
  'Small Warehouse',
  'Other',
] as const;

export const STOCK_ADJUSTMENT_REASONS = [
  'Damage / Breakage',
  'Spoilage / Expiry',
  'Audit / Count Correction',
  'Measurement / Cutting Loss',
  'Found / Unrecorded Stock',
  'Sample / Internal Use',
  'Other Reason',
] as const;
