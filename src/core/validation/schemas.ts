import { z } from 'zod';
import { isValidIsoDate } from '../utils/dateUtils';

export const businessProfileSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, 'Business name must be at least 2 characters')
    .max(120, 'Business name cannot exceed 120 characters'),
  businessType: z.string().trim().min(1, 'Business type is required'),
  ownerName: z.string().trim().max(100).optional().nullable(),
  contactNumber: z.string().trim().max(30).optional().nullable(),
  businessAddress: z.string().trim().max(250).optional().nullable(),
  country: z.string().trim().min(1, 'Country is required'),
  dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']),
  timezone: z.string().trim().min(1, 'Timezone is required'),
  defaultUnitId: z.string().optional().nullable(),
});

export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Category name is required')
    .max(60, 'Category name cannot exceed 60 characters'),
  parentId: z.string().optional().nullable(),
  description: z.string().trim().max(200).optional().nullable(),
  colorHex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex code')
    .default('#2563EB'),
});

export const unitOfMeasureSchema = z.object({
  name: z.string().trim().min(1, 'Unit name is required').max(40),
  symbol: z.string().trim().min(1, 'Unit symbol is required').max(15),
  allowFractional: z.boolean().default(false),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Supplier name is required').max(100),
  contactNumber: z.string().trim().max(30).optional().nullable(),
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .optional()
    .or(z.literal(''))
    .nullable(),
  address: z.string().trim().max(250).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const variantInputSchema = z.object({
  id: z.string().optional(),
  variantName: z.string().trim().min(1, 'Variant name is required'),
  attributeValues: z.record(z.string(), z.string()),
  sku: z.string().trim().min(1, 'Variant SKU is required'),
  barcode: z.string().trim().optional().nullable(),
  minStockThreshold: z
    .number({ invalid_type_error: 'Minimum threshold must be a number' })
    .min(0, 'Minimum stock threshold cannot be negative')
    .finite(),
  openingStock: z
    .number()
    .min(0, 'Opening stock cannot be negative')
    .finite()
    .optional()
    .nullable(),
  reorderQuantity: z
    .number()
    .min(0, 'Reorder quantity cannot be negative')
    .finite()
    .optional()
    .nullable(),
});

export const productCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Product name is required')
    .max(120, 'Product name cannot exceed 120 characters'),
  sku: z
    .string()
    .trim()
    .min(1, 'SKU is required')
    .max(50, 'SKU cannot exceed 50 characters'),
  barcode: z.string().trim().max(64).optional().nullable(),
  categoryId: z.string().trim().min(1, 'Category is required'),
  subcategoryId: z.string().trim().optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  unitId: z.string().trim().min(1, 'Unit of measurement is required'),
  minStockThreshold: z
    .number({ invalid_type_error: 'Minimum threshold must be a number' })
    .min(0, 'Minimum stock threshold cannot be negative')
    .finite(),
  openingStock: z
    .number()
    .min(0, 'Opening stock cannot be negative')
    .finite()
    .optional()
    .nullable(),
  openingStockDate: z
    .string()
    .refine((d) => !d || isValidIsoDate(d), 'Invalid opening stock date')
    .optional(),
  reorderQuantity: z
    .number()
    .min(0, 'Reorder quantity cannot be negative')
    .finite()
    .optional()
    .nullable(),
  supplierId: z.string().trim().optional().nullable(),
  imageUri: z.string().optional().nullable(),
  hasVariants: z.boolean().default(false),
  attributes: z
    .array(
      z.object({
        attributeName: z.string().trim().min(1),
        attributeOptions: z.array(z.string().trim().min(1)).min(1),
      })
    )
    .optional(),
  variants: z.array(variantInputSchema).optional(),
});

export const stockInwardSchema = z.object({
  itemKey: z.string().trim().min(1, 'Product or variant is required'),
  productId: z.string().trim().min(1, 'Product is required'),
  variantId: z.string().trim().optional().nullable(),
  quantity: z
    .number({ invalid_type_error: 'Quantity must be a valid number' })
    .positive('Quantity received must be greater than zero')
    .finite(),
  eventDate: z.string().refine(isValidIsoDate, 'Valid receipt date (YYYY-MM-DD) is required'),
  supplierId: z.string().trim().optional().nullable(),
  referenceNumber: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(400).optional().nullable(),
});

export const physicalCountEntrySchema = z.object({
  itemKey: z.string().trim().min(1, 'Item key is required'),
  productId: z.string().trim().min(1, 'Product ID is required'),
  variantId: z.string().trim().optional().nullable(),
  countedQuantity: z
    .number({ invalid_type_error: 'Counted quantity must be a number' })
    .min(0, 'Physical count cannot be negative')
    .finite(),
  notes: z.string().trim().max(400).optional().nullable(),
});

export const batchPhysicalCountSchema = z.object({
  eventDate: z.string().refine(isValidIsoDate, 'Valid count date (YYYY-MM-DD) is required'),
  entries: z
    .array(physicalCountEntrySchema)
    .min(1, 'At least one counted item is required'),
  sessionNotes: z.string().trim().max(400).optional().nullable(),
});

export const stockAdjustmentSchema = z.object({
  itemKey: z.string().trim().min(1, 'Product or variant is required'),
  productId: z.string().trim().min(1, 'Product is required'),
  variantId: z.string().trim().optional().nullable(),
  quantityDelta: z
    .number({ invalid_type_error: 'Quantity difference must be a number' })
    .finite()
    .refine((n) => n !== 0, 'Quantity difference cannot be zero'),
  reason: z.string().trim().min(2, 'Adjustment reason is mandatory'),
  eventDate: z.string().refine(isValidIsoDate, 'Valid adjustment date is required'),
  notes: z.string().trim().max(400).optional().nullable(),
});

export const dateRangeFilterSchema = z
  .object({
    startDate: z.string().refine(isValidIsoDate, 'Invalid start date'),
    endDate: z.string().refine(isValidIsoDate, 'Invalid end date'),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: 'Start date cannot be later than end date',
    path: ['endDate'],
  });
