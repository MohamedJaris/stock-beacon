import { getTodayInTimezone } from '@/core/utils/dateUtils';
import { normalizeQuantity } from '@/core/utils/quantityMath';
import { generateId } from '@/core/utils/skuGenerator';
import {
  Category,
  InventoryItemView,
  Product,
  ProductAttribute,
  ProductVariant,
  Supplier,
  UnitOfMeasure,
} from '@/domain/entities';
import { QuantityProvenance, StockStatus } from '@/domain/enums';
import { evaluateStockStatus } from '@/domain/services/InventoryCalculationEngine';
import { IDatabaseAdapter } from '../database/DatabaseAdapter';
import { SqliteInventoryRepository } from './SqliteInventoryRepository';

export interface CreateProductVariantInput {
  id?: string;
  variantName: string;
  attributeValues: Record<string, string>;
  sku: string;
  barcode?: string | null;
  minStockThreshold: number;
  openingStock?: number | null;
  reorderQuantity?: number | null;
}

export interface CreateProductInput {
  workspaceId: string;
  name: string;
  sku: string;
  barcode?: string | null;
  categoryId: string;
  subcategoryId?: string | null;
  description?: string | null;
  unitId: string;
  minStockThreshold: number;
  openingStock?: number | null;
  openingStockDate?: string;
  reorderQuantity?: number | null;
  supplierId?: string | null;
  imageUri?: string | null;
  hasVariants?: boolean;
  attributes?: { attributeName: string; attributeOptions: string[] }[];
  variants?: CreateProductVariantInput[];
}

export interface ProductDetailBundle {
  product: Product;
  categoryName: string;
  unit: UnitOfMeasure;
  supplierName: string | null;
  attributes: ProductAttribute[];
  variants: ProductVariant[];
  items: InventoryItemView[]; // Either 1 item (base product) or N variant items
}

export class SqliteCatalogRepository {
  constructor(
    private readonly db: IDatabaseAdapter,
    private readonly inventoryRepo: SqliteInventoryRepository
  ) {}

  // ===========================================================================
  // CATEGORIES
  // ===========================================================================
  async listCategories(
    workspaceId: string,
    includeArchived = false
  ): Promise<Category[]> {
    const sql = includeArchived
      ? 'SELECT * FROM categories WHERE workspace_id = ? ORDER BY name ASC'
      : 'SELECT * FROM categories WHERE workspace_id = ? AND is_archived = 0 ORDER BY name ASC';
    const rows = await this.db.getAllAsync<Record<string, unknown>>(sql, [
      workspaceId,
    ]);
    return rows.map((r) => ({
      id: String(r.id),
      workspaceId: String(r.workspace_id),
      name: String(r.name),
      parentId: r.parent_id ? String(r.parent_id) : null,
      description: r.description ? String(r.description) : null,
      colorHex: String(r.color_hex || '#2563EB'),
      isArchived: Boolean(r.is_archived),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async createCategory(params: {
    workspaceId: string;
    name: string;
    parentId?: string | null;
    description?: string | null;
    colorHex?: string;
  }): Promise<Category> {
    const trimmedName = params.name.trim();
    if (!trimmedName) {
      throw new Error('Category name is required.');
    }
    const existing = await this.db.getFirstAsync<{ id: string }>(
      `SELECT id FROM categories
       WHERE workspace_id = ? AND LOWER(name) = LOWER(?) AND COALESCE(parent_id, '') = COALESCE(?, '')`,
      [params.workspaceId, trimmedName, params.parentId ?? null]
    );
    if (existing) {
      throw new Error(`Category "${trimmedName}" already exists.`);
    }

    const id = generateId();
    const now = new Date().toISOString();
    const colorHex = params.colorHex || '#2563EB';

    await this.db.runAsync(
      `INSERT INTO categories (
        id, workspace_id, name, parent_id, description, color_hex, is_archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        params.workspaceId,
        trimmedName,
        params.parentId ?? null,
        params.description?.trim() || null,
        colorHex,
        now,
        now,
      ]
    );

    return {
      id,
      workspaceId: params.workspaceId,
      name: trimmedName,
      parentId: params.parentId ?? null,
      description: params.description?.trim() || null,
      colorHex,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  async updateCategory(
    id: string,
    updates: {
      name?: string;
      description?: string | null;
      colorHex?: string;
      isArchived?: boolean;
    }
  ): Promise<void> {
    const row = await this.db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM categories WHERE id = ?',
      [id]
    );
    if (!row) throw new Error('Category not found.');

    const nextName = updates.name?.trim() ?? String(row.name);
    if (!nextName) {
      throw new Error('Category name cannot be empty.');
    }

    if (nextName.toLowerCase() !== String(row.name).toLowerCase()) {
      const duplicate = await this.db.getFirstAsync<{ id: string }>(
        `SELECT id FROM categories
         WHERE workspace_id = ? AND LOWER(name) = LOWER(?) AND id != ? AND is_archived = 0`,
        [String(row.workspace_id), nextName, id]
      );
      if (duplicate) {
        throw new Error(`Category "${nextName}" already exists.`);
      }
    }

    const now = new Date().toISOString();
    await this.db.runAsync(
      `UPDATE categories SET
        name = ?,
        description = ?,
        color_hex = ?,
        is_archived = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        nextName,
        updates.description !== undefined
          ? updates.description
          : row.description
          ? String(row.description)
          : null,
        updates.colorHex ?? String(row.color_hex),
        updates.isArchived !== undefined
          ? updates.isArchived
            ? 1
            : 0
          : Number(row.is_archived),
        now,
        id,
      ]
    );
  }

  /**
   * Removes a category:
   * - If no products reference this category, permanently deletes it.
   * - If products reference this category and `reassignToCategoryId` is provided,
   *   reassigns those products to `reassignToCategoryId` and deletes the category.
   * - Otherwise archives (`is_archived = 1`) the category so product foreign keys and history remain intact.
   */
  async deleteOrRemoveCategory(params: {
    workspaceId: string;
    categoryId: string;
    reassignToCategoryId?: string | null;
  }): Promise<{ mode: 'deleted' | 'archived' }> {
    const prodCountRow = await this.db.getFirstAsync<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM products WHERE workspace_id = ? AND category_id = ?',
      [params.workspaceId, params.categoryId]
    );
    const prodCount = Number(prodCountRow?.cnt ?? 0);

    return await this.db.withTransactionAsync(async () => {
      if (prodCount === 0) {
        await this.db.runAsync(
          'DELETE FROM categories WHERE id = ? AND workspace_id = ?',
          [params.categoryId, params.workspaceId]
        );
        return { mode: 'deleted' };
      }

      if (params.reassignToCategoryId) {
        await this.db.runAsync(
          'UPDATE products SET category_id = ?, updated_at = ? WHERE workspace_id = ? AND category_id = ?',
          [
            params.reassignToCategoryId,
            new Date().toISOString(),
            params.workspaceId,
            params.categoryId,
          ]
        );
        await this.db.runAsync(
          'DELETE FROM categories WHERE id = ? AND workspace_id = ?',
          [params.categoryId, params.workspaceId]
        );
        return { mode: 'deleted' };
      }

      await this.db.runAsync(
        'UPDATE categories SET is_archived = 1, updated_at = ? WHERE id = ? AND workspace_id = ?',
        [new Date().toISOString(), params.categoryId, params.workspaceId]
      );
      return { mode: 'archived' };
    });
  }

  // ===========================================================================
  // UNITS OF MEASURE
  // ===========================================================================
  async listUnits(
    workspaceId: string,
    includeArchived = false
  ): Promise<UnitOfMeasure[]> {
    const sql = includeArchived
      ? 'SELECT * FROM units_of_measure WHERE workspace_id = ? ORDER BY is_custom ASC, name ASC'
      : 'SELECT * FROM units_of_measure WHERE workspace_id = ? AND is_archived = 0 ORDER BY is_custom ASC, name ASC';
    const rows = await this.db.getAllAsync<Record<string, unknown>>(sql, [
      workspaceId,
    ]);
    return rows.map((r) => ({
      id: String(r.id),
      workspaceId: String(r.workspace_id),
      name: String(r.name),
      symbol: String(r.symbol),
      allowFractional: Boolean(r.allow_fractional),
      isCustom: Boolean(r.is_custom),
      isArchived: Boolean(r.is_archived),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async createUnit(params: {
    workspaceId: string;
    name: string;
    symbol: string;
    allowFractional: boolean;
  }): Promise<UnitOfMeasure> {
    const trimmedName = params.name.trim();
    const trimmedSymbol = params.symbol.trim();
    if (!trimmedName || !trimmedSymbol) {
      throw new Error('Unit name and symbol are required.');
    }
    const existing = await this.db.getFirstAsync<{ id: string }>(
      'SELECT id FROM units_of_measure WHERE workspace_id = ? AND LOWER(symbol) = LOWER(?)',
      [params.workspaceId, trimmedSymbol]
    );
    if (existing) {
      throw new Error(`Unit with symbol "${trimmedSymbol}" already exists.`);
    }

    const id = generateId();
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT INTO units_of_measure (
        id, workspace_id, name, symbol, allow_fractional, is_custom, is_archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`,
      [
        id,
        params.workspaceId,
        trimmedName,
        trimmedSymbol,
        params.allowFractional ? 1 : 0,
        now,
        now,
      ]
    );

    return {
      id,
      workspaceId: params.workspaceId,
      name: trimmedName,
      symbol: trimmedSymbol,
      allowFractional: params.allowFractional,
      isCustom: true,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  // ===========================================================================
  // SUPPLIERS
  // ===========================================================================
  async listSuppliers(
    workspaceId: string,
    includeArchived = false
  ): Promise<Supplier[]> {
    const sql = includeArchived
      ? 'SELECT * FROM suppliers WHERE workspace_id = ? ORDER BY name ASC'
      : 'SELECT * FROM suppliers WHERE workspace_id = ? AND is_archived = 0 ORDER BY name ASC';
    const rows = await this.db.getAllAsync<Record<string, unknown>>(sql, [
      workspaceId,
    ]);
    return rows.map((r) => ({
      id: String(r.id),
      workspaceId: String(r.workspace_id),
      name: String(r.name),
      contactNumber: r.contact_number ? String(r.contact_number) : null,
      email: r.email ? String(r.email) : null,
      address: r.address ? String(r.address) : null,
      notes: r.notes ? String(r.notes) : null,
      isArchived: Boolean(r.is_archived),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async createSupplier(params: {
    workspaceId: string;
    name: string;
    contactNumber?: string | null;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
  }): Promise<Supplier> {
    const trimmedName = params.name.trim();
    if (!trimmedName) {
      throw new Error('Supplier name is required.');
    }
    const id = generateId();
    const now = new Date().toISOString();

    await this.db.runAsync(
      `INSERT INTO suppliers (
        id, workspace_id, name, contact_number, email, address, notes, is_archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        params.workspaceId,
        trimmedName,
        params.contactNumber?.trim() || null,
        params.email?.trim() || null,
        params.address?.trim() || null,
        params.notes?.trim() || null,
        now,
        now,
      ]
    );

    return {
      id,
      workspaceId: params.workspaceId,
      name: trimmedName,
      contactNumber: params.contactNumber?.trim() || null,
      email: params.email?.trim() || null,
      address: params.address?.trim() || null,
      notes: params.notes?.trim() || null,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  async updateSupplier(
    id: string,
    updates: Partial<
      Pick<
        Supplier,
        'name' | 'contactNumber' | 'email' | 'address' | 'notes' | 'isArchived'
      >
    >
  ): Promise<Supplier> {
    const row = await this.db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM suppliers WHERE id = ?',
      [id]
    );
    if (!row) throw new Error('Supplier not found.');
    const now = new Date().toISOString();

    await this.db.runAsync(
      `UPDATE suppliers SET
        name = ?,
        contact_number = ?,
        email = ?,
        address = ?,
        notes = ?,
        is_archived = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        updates.name?.trim() ?? String(row.name),
        updates.contactNumber !== undefined
          ? updates.contactNumber?.trim() || null
          : row.contact_number
          ? String(row.contact_number)
          : null,
        updates.email !== undefined
          ? updates.email?.trim() || null
          : row.email
          ? String(row.email)
          : null,
        updates.address !== undefined
          ? updates.address?.trim() || null
          : row.address
          ? String(row.address)
          : null,
        updates.notes !== undefined
          ? updates.notes?.trim() || null
          : row.notes
          ? String(row.notes)
          : null,
        updates.isArchived !== undefined
          ? updates.isArchived
            ? 1
            : 0
          : Number(row.is_archived),
        now,
        id,
      ]
    );

    const updated = await this.db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM suppliers WHERE id = ?',
      [id]
    );
    if (!updated) throw new Error('Supplier missing after update.');
    return {
      id: String(updated.id),
      workspaceId: String(updated.workspace_id),
      name: String(updated.name),
      contactNumber: updated.contact_number
        ? String(updated.contact_number)
        : null,
      email: updated.email ? String(updated.email) : null,
      address: updated.address ? String(updated.address) : null,
      notes: updated.notes ? String(updated.notes) : null,
      isArchived: Boolean(updated.is_archived),
      createdAt: String(updated.created_at),
      updatedAt: String(updated.updated_at),
    };
  }

  // ===========================================================================
  // SKU & BARCODE UNIQUENESS CHECKS
  // ===========================================================================
  async isSkuTaken(
    workspaceId: string,
    sku: string,
    excludeProductId?: string,
    excludeVariantId?: string
  ): Promise<boolean> {
    const cleanSku = sku.trim();
    const prodMatch = await this.db.getFirstAsync<{ id: string }>(
      `SELECT id FROM products
       WHERE workspace_id = ? AND UPPER(sku) = UPPER(?) AND id != COALESCE(?, '')`,
      [workspaceId, cleanSku, excludeProductId ?? null]
    );
    if (prodMatch) return true;

    const varMatch = await this.db.getFirstAsync<{ id: string }>(
      `SELECT id FROM product_variants
       WHERE workspace_id = ? AND UPPER(sku) = UPPER(?) AND id != COALESCE(?, '')`,
      [workspaceId, cleanSku, excludeVariantId ?? null]
    );
    return Boolean(varMatch);
  }

  async isBarcodeTaken(
    workspaceId: string,
    barcode: string,
    excludeProductId?: string,
    excludeVariantId?: string
  ): Promise<boolean> {
    const cleanBarcode = barcode.trim();
    if (!cleanBarcode) return false;

    const prodMatch = await this.db.getFirstAsync<{ id: string }>(
      `SELECT id FROM products
       WHERE workspace_id = ? AND barcode = ? AND id != COALESCE(?, '')`,
      [workspaceId, cleanBarcode, excludeProductId ?? null]
    );
    if (prodMatch) return true;

    const varMatch = await this.db.getFirstAsync<{ id: string }>(
      `SELECT id FROM product_variants
       WHERE workspace_id = ? AND barcode = ? AND id != COALESCE(?, '')`,
      [workspaceId, cleanBarcode, excludeVariantId ?? null]
    );
    return Boolean(varMatch);
  }

  // ===========================================================================
  // PRODUCT & VARIANT CREATION (ATOMIC)
  // ===========================================================================
  async createProduct(input: CreateProductInput): Promise<ProductDetailBundle> {
    const trimmedName = input.name.trim();
    const trimmedSku = input.sku.trim();
    const trimmedBarcode = input.barcode?.trim() || null;

    if (!trimmedName) {
      throw new Error('Product name is required.');
    }
    if (!trimmedSku) {
      throw new Error('Product SKU is required.');
    }
    if (
      input.minStockThreshold < 0 ||
      Number.isNaN(input.minStockThreshold) ||
      !Number.isFinite(input.minStockThreshold)
    ) {
      throw new Error('Minimum stock threshold must be zero or greater.');
    }
    if (
      input.openingStock !== undefined &&
      input.openingStock !== null &&
      (input.openingStock < 0 || Number.isNaN(input.openingStock))
    ) {
      throw new Error('Opening stock cannot be negative.');
    }

    if (await this.isSkuTaken(input.workspaceId, trimmedSku)) {
      throw new Error(`SKU "${trimmedSku}" is already in use.`);
    }
    if (
      trimmedBarcode &&
      (await this.isBarcodeTaken(input.workspaceId, trimmedBarcode))
    ) {
      throw new Error(`Barcode "${trimmedBarcode}" is already assigned to another item.`);
    }

    const hasVariants = Boolean(
      input.hasVariants && input.variants && input.variants.length > 0
    );

    if (hasVariants && input.variants) {
      const seenSkus = new Set<string>([trimmedSku.toUpperCase()]);
      const seenBarcodes = new Set<string>(
        trimmedBarcode ? [trimmedBarcode] : []
      );
      for (const v of input.variants) {
        const vSku = v.sku.trim().toUpperCase();
        if (!vSku) throw new Error('Every variant must have a SKU.');
        if (seenSkus.has(vSku) || (await this.isSkuTaken(input.workspaceId, vSku))) {
          throw new Error(`Duplicate variant SKU "${v.sku}".`);
        }
        seenSkus.add(vSku);

        const vBarcode = v.barcode?.trim() || null;
        if (vBarcode) {
          if (
            seenBarcodes.has(vBarcode) ||
            (await this.isBarcodeTaken(input.workspaceId, vBarcode))
          ) {
            throw new Error(`Duplicate variant barcode "${vBarcode}".`);
          }
          seenBarcodes.add(vBarcode);
        }

        if (v.minStockThreshold < 0 || Number.isNaN(v.minStockThreshold)) {
          throw new Error(
            `Invalid minimum threshold for variant "${v.variantName}".`
          );
        }
      }
    }

    const productId = generateId();
    const now = new Date().toISOString();
    const eventDate =
      input.openingStockDate || getTodayInTimezone('Asia/Kolkata');
    const normalizedThreshold = normalizeQuantity(input.minStockThreshold);
    const normalizedReorder =
      input.reorderQuantity !== undefined && input.reorderQuantity !== null
        ? normalizeQuantity(input.reorderQuantity)
        : null;

    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `INSERT INTO products (
          id, workspace_id, name, sku, barcode, category_id, subcategory_id,
          description, unit_id, min_stock_threshold, reorder_quantity,
          supplier_id, image_uri, has_variants, is_archived, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          productId,
          input.workspaceId,
          trimmedName,
          trimmedSku,
          trimmedBarcode,
          input.categoryId,
          input.subcategoryId ?? null,
          input.description?.trim() || null,
          input.unitId,
          normalizedThreshold,
          normalizedReorder,
          input.supplierId ?? null,
          input.imageUri ?? null,
          hasVariants ? 1 : 0,
          now,
          now,
        ]
      );

      if (hasVariants && input.variants) {
        if (input.attributes && input.attributes.length > 0) {
          for (let i = 0; i < input.attributes.length; i++) {
            const attr = input.attributes[i];
            await this.db.runAsync(
              `INSERT INTO product_attributes (
                id, workspace_id, product_id, attribute_name, attribute_options_json, display_order, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                generateId(),
                input.workspaceId,
                productId,
                attr.attributeName.trim(),
                JSON.stringify(attr.attributeOptions),
                i,
                now,
              ]
            );
          }
        }

        for (let vIndex = 0; vIndex < input.variants.length; vIndex++) {
          const v = input.variants[vIndex];
          const variantId = v.id || generateId();
          const vThreshold = normalizeQuantity(v.minStockThreshold);
          const vReorder =
            v.reorderQuantity !== undefined && v.reorderQuantity !== null
              ? normalizeQuantity(v.reorderQuantity)
              : normalizedReorder;

          const attrValsWithOrder = {
            ...(v.attributeValues || {}),
            __order: String(vIndex),
          };

          await this.db.runAsync(
            `INSERT INTO product_variants (
              id, workspace_id, product_id, variant_name, attribute_values_json,
              sku, barcode, min_stock_threshold, reorder_quantity, is_archived, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
            [
              variantId,
              input.workspaceId,
              productId,
              v.variantName.trim(),
              JSON.stringify(attrValsWithOrder),
              v.sku.trim(),
              v.barcode?.trim() || null,
              vThreshold,
              vReorder,
              now,
              now,
            ]
          );

          await this.inventoryRepo.initializeItemBaselineInTransaction({
            workspaceId: input.workspaceId,
            itemKey: variantId,
            productId,
            variantId,
            minStockThreshold: vThreshold,
            openingStock:
              v.openingStock !== undefined && v.openingStock !== null
                ? normalizeQuantity(v.openingStock)
                : null,
            effectiveDate: eventDate,
            timestamp: now,
          });
        }
      } else {
        await this.inventoryRepo.initializeItemBaselineInTransaction({
          workspaceId: input.workspaceId,
          itemKey: productId,
          productId,
          variantId: null,
          minStockThreshold: normalizedThreshold,
          openingStock:
            input.openingStock !== undefined && input.openingStock !== null
              ? normalizeQuantity(input.openingStock)
              : null,
          effectiveDate: eventDate,
          timestamp: now,
        });
      }

      await this.db.runAsync(
        `INSERT INTO audit_logs (
          id, workspace_id, action_type, entity_type, entity_id, summary, metadata_json, created_at
        ) VALUES (?, ?, 'PRODUCT_CREATED', 'PRODUCT', ?, ?, ?, ?)`,
        [
          generateId(),
          input.workspaceId,
          productId,
          `Created product "${trimmedName}" (${trimmedSku})`,
          JSON.stringify({ hasVariants, sku: trimmedSku }),
          now,
        ]
      );
    });

    const detail = await this.getProductDetail(input.workspaceId, productId);
    if (!detail) {
      throw new Error('Failed to load newly created product.');
    }
    return detail;
  }

  // ===========================================================================
  // PRODUCT UPDATE & ARCHIVAL (SOFT DELETE PRESERVING HISTORY)
  // ===========================================================================
  async updateProduct(params: {
    workspaceId: string;
    productId: string;
    name?: string;
    sku?: string;
    barcode?: string | null;
    categoryId?: string;
    subcategoryId?: string | null;
    description?: string | null;
    unitId?: string;
    minStockThreshold?: number;
    reorderQuantity?: number | null;
    supplierId?: string | null;
    imageUri?: string | null;
    effectiveDate?: string;
  }): Promise<ProductDetailBundle> {
    const existing = await this.db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM products WHERE id = ? AND workspace_id = ?',
      [params.productId, params.workspaceId]
    );
    if (!existing) {
      throw new Error('Product not found.');
    }

    if (params.sku && params.sku.trim() !== String(existing.sku)) {
      if (
        await this.isSkuTaken(
          params.workspaceId,
          params.sku.trim(),
          params.productId
        )
      ) {
        throw new Error(`SKU "${params.sku.trim()}" is already in use.`);
      }
    }

    if (
      params.barcode !== undefined &&
      params.barcode?.trim() &&
      params.barcode.trim() !== String(existing.barcode ?? '')
    ) {
      if (
        await this.isBarcodeTaken(
          params.workspaceId,
          params.barcode.trim(),
          params.productId
        )
      ) {
        throw new Error(
          `Barcode "${params.barcode.trim()}" is already assigned to another item.`
        );
      }
    }

    if (
      params.minStockThreshold !== undefined &&
      (params.minStockThreshold < 0 || Number.isNaN(params.minStockThreshold))
    ) {
      throw new Error('Minimum stock threshold cannot be negative.');
    }

    const now = new Date().toISOString();
    const newThreshold =
      params.minStockThreshold !== undefined
        ? normalizeQuantity(params.minStockThreshold)
        : Number(existing.min_stock_threshold);
    const thresholdChanged =
      params.minStockThreshold !== undefined &&
      newThreshold !== Number(existing.min_stock_threshold);

    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        `UPDATE products SET
          name = ?,
          sku = ?,
          barcode = ?,
          category_id = ?,
          subcategory_id = ?,
          description = ?,
          unit_id = ?,
          min_stock_threshold = ?,
          reorder_quantity = ?,
          supplier_id = ?,
          image_uri = ?,
          updated_at = ?
        WHERE id = ? AND workspace_id = ?`,
        [
          params.name?.trim() ?? String(existing.name),
          params.sku?.trim() ?? String(existing.sku),
          params.barcode !== undefined
            ? params.barcode?.trim() || null
            : existing.barcode
            ? String(existing.barcode)
            : null,
          params.categoryId ?? String(existing.category_id),
          params.subcategoryId !== undefined
            ? params.subcategoryId
            : existing.subcategory_id
            ? String(existing.subcategory_id)
            : null,
          params.description !== undefined
            ? params.description?.trim() || null
            : existing.description
            ? String(existing.description)
            : null,
          params.unitId ?? String(existing.unit_id),
          newThreshold,
          params.reorderQuantity !== undefined
            ? params.reorderQuantity
            : existing.reorder_quantity !== null
            ? Number(existing.reorder_quantity)
            : null,
          params.supplierId !== undefined
            ? params.supplierId
            : existing.supplier_id
            ? String(existing.supplier_id)
            : null,
          params.imageUri !== undefined
            ? params.imageUri
            : existing.image_uri
            ? String(existing.image_uri)
            : null,
          now,
          params.productId,
          params.workspaceId,
        ]
      );

      if (thresholdChanged && !Boolean(existing.has_variants)) {
        await this.inventoryRepo.updateMinimumThresholdInTransaction({
          workspaceId: params.workspaceId,
          itemKey: params.productId,
          productId: params.productId,
          variantId: null,
          newThreshold,
          effectiveDate:
            params.effectiveDate || getTodayInTimezone('Asia/Kolkata'),
          reason: 'Updated product minimum stock threshold',
        });
      }
    });

    const updated = await this.getProductDetail(
      params.workspaceId,
      params.productId
    );
    if (!updated) throw new Error('Product missing after update.');
    return updated;
  }

  /**
   * Archives or unarchives a product without deleting any stock events, threshold history, or snapshots.
   */
  async setProductArchived(
    workspaceId: string,
    productId: string,
    isArchived: boolean
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        'UPDATE products SET is_archived = ?, updated_at = ? WHERE id = ? AND workspace_id = ?',
        [isArchived ? 1 : 0, now, productId, workspaceId]
      );
      await this.db.runAsync(
        'UPDATE product_variants SET is_archived = ?, updated_at = ? WHERE product_id = ? AND workspace_id = ?',
        [isArchived ? 1 : 0, now, productId, workspaceId]
      );
      await this.db.runAsync(
        `INSERT INTO audit_logs (
          id, workspace_id, action_type, entity_type, entity_id, summary, metadata_json, created_at
        ) VALUES (?, ?, ?, 'PRODUCT', ?, ?, NULL, ?)`,
        [
          generateId(),
          workspaceId,
          isArchived ? 'PRODUCT_ARCHIVED' : 'PRODUCT_RESTORED',
          productId,
          `${isArchived ? 'Archived' : 'Restored'} product ${productId} (history preserved)`,
          now,
        ]
      );
    });
  }

  // ===========================================================================
  // QUERIES: INVENTORY ITEM VIEWS, PRODUCT DETAILS, BARCODE LOOKUP
  // ===========================================================================
  async listInventoryItems(params: {
    workspaceId: string;
    includeArchived?: boolean;
    categoryId?: string | null;
    stockStatus?: StockStatus | null;
    searchQuery?: string;
    sortBy?: 'input_order' | 'name' | 'quantity_asc' | 'quantity_desc' | 'updated';
  }): Promise<InventoryItemView[]> {
    const {
      workspaceId,
      includeArchived = false,
      categoryId,
      stockStatus,
      searchQuery,
      sortBy = 'input_order',
    } = params;

    const rows = await this.db.getAllAsync<Record<string, unknown>>(
      `SELECT
        ib.item_key,
        ib.product_id,
        ib.variant_id,
        ib.recorded_quantity,
        ib.min_stock_threshold,
        ib.stock_status,
        ib.quantity_provenance,
        ib.last_physical_count_date,
        ib.last_inward_date,
        ib.updated_at,
        p.name AS product_name,
        p.sku AS product_sku,
        p.barcode AS product_barcode,
        p.category_id,
        p.subcategory_id,
        p.unit_id,
        p.reorder_quantity AS product_reorder_qty,
        p.supplier_id,
        p.is_archived AS product_archived,
        p.created_at AS product_created_at,
        pv.variant_name,
        pv.attribute_values_json,
        pv.sku AS variant_sku,
        pv.barcode AS variant_barcode,
        pv.reorder_quantity AS variant_reorder_qty,
        pv.is_archived AS variant_archived,
        pv.rowid AS variant_rowid,
        c.name AS category_name,
        c.color_hex AS category_color,
        u.name AS unit_name,
        u.symbol AS unit_symbol,
        u.allow_fractional,
        s.name AS supplier_name
      FROM inventory_balances ib
      INNER JOIN products p ON p.id = ib.product_id
      LEFT JOIN product_variants pv ON pv.id = ib.variant_id
      INNER JOIN categories c ON c.id = p.category_id
      INNER JOIN units_of_measure u ON u.id = p.unit_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE ib.workspace_id = ?
      ORDER BY p.rowid ASC, pv.rowid ASC`,
      [workspaceId]
    );

    const normalizedSearch = searchQuery?.trim().toLowerCase() ?? '';

    const items: InventoryItemView[] = [];
    for (const r of rows) {
      const isArchived =
        Boolean(r.product_archived) || Boolean(r.variant_archived);
      if (!includeArchived && isArchived) {
        continue;
      }
      if (categoryId && String(r.category_id) !== categoryId) {
        continue;
      }

      const recordedQty =
        r.recorded_quantity !== null && r.recorded_quantity !== undefined
          ? Number(r.recorded_quantity)
          : null;
      const threshold = Number(r.min_stock_threshold);
      const status = evaluateStockStatus(recordedQty, threshold);

      if (stockStatus && status !== stockStatus) {
        continue;
      }

      const productName = String(r.product_name);
      const variantName = r.variant_name ? String(r.variant_name) : null;
      const displayName = variantName
        ? `${productName} (${variantName})`
        : productName;
      const sku = r.variant_sku ? String(r.variant_sku) : String(r.product_sku);
      const barcode = r.variant_barcode
        ? String(r.variant_barcode)
        : r.product_barcode
        ? String(r.product_barcode)
        : null;

      if (normalizedSearch) {
        const matchesName = displayName.toLowerCase().includes(normalizedSearch);
        const matchesSku = sku.toLowerCase().includes(normalizedSearch);
        const matchesBarcode = barcode
          ? barcode.toLowerCase().includes(normalizedSearch)
          : false;
        const matchesCat = String(r.category_name)
          .toLowerCase()
          .includes(normalizedSearch);
        if (!matchesName && !matchesSku && !matchesBarcode && !matchesCat) {
          continue;
        }
      }

      let parsedAttrs: Record<string, string> = {};
      let variantSortOrder = 0;
      if (r.attribute_values_json) {
        try {
          parsedAttrs = JSON.parse(String(r.attribute_values_json));
          if (parsedAttrs.__order !== undefined) {
            variantSortOrder = Number(parsedAttrs.__order);
          } else if (r.variant_rowid !== undefined && r.variant_rowid !== null) {
            variantSortOrder = Number(r.variant_rowid);
          }
        } catch {
          parsedAttrs = {};
        }
      }

      items.push({
        itemKey: String(r.item_key),
        productId: String(r.product_id),
        variantId: r.variant_id ? String(r.variant_id) : null,
        productName,
        variantName,
        attributeValues: parsedAttrs,
        variantSortOrder,
        productCreatedAt: r.product_created_at
          ? String(r.product_created_at)
          : undefined,
        displayName,
        sku,
        barcode,
        categoryId: String(r.category_id),
        categoryName: String(r.category_name),
        categoryColor: String(r.category_color || '#2563EB'),
        subcategoryId: r.subcategory_id ? String(r.subcategory_id) : null,
        unitId: String(r.unit_id),
        unitName: String(r.unit_name),
        unitSymbol: String(r.unit_symbol),
        allowFractional: Boolean(r.allow_fractional),
        supplierId: r.supplier_id ? String(r.supplier_id) : null,
        supplierName: r.supplier_name ? String(r.supplier_name) : null,
        recordedQuantity: recordedQty,
        minStockThreshold: threshold,
        reorderQuantity:
          r.variant_reorder_qty !== null && r.variant_reorder_qty !== undefined
            ? Number(r.variant_reorder_qty)
            : r.product_reorder_qty !== null &&
              r.product_reorder_qty !== undefined
            ? Number(r.product_reorder_qty)
            : null,
        stockStatus: status,
        quantityProvenance: r.quantity_provenance as QuantityProvenance,
        lastPhysicalCountDate: r.last_physical_count_date
          ? String(r.last_physical_count_date)
          : null,
        lastInwardDate: r.last_inward_date ? String(r.last_inward_date) : null,
        isArchived,
      });
    }

    items.sort((a, b) => {
      if (sortBy === 'quantity_asc') {
        const qa = a.recordedQuantity ?? Number.POSITIVE_INFINITY;
        const qb = b.recordedQuantity ?? Number.POSITIVE_INFINITY;
        if (qa !== qb) return qa - qb;
      } else if (sortBy === 'quantity_desc') {
        const qa = a.recordedQuantity ?? Number.NEGATIVE_INFINITY;
        const qb = b.recordedQuantity ?? Number.NEGATIVE_INFINITY;
        if (qa !== qb) return qb - qa;
      } else if (sortBy === 'name') {
        return a.displayName.localeCompare(b.displayName);
      }

      // Default ('input_order'): preserve exact product creation order & exact input size/variant sequence
      if (a.productId === b.productId) {
        return (a.variantSortOrder ?? 0) - (b.variantSortOrder ?? 0);
      }
      return 0;
    });

    return items;
  }

  async getProductDetail(
    workspaceId: string,
    productId: string
  ): Promise<ProductDetailBundle | null> {
    const prodRow = await this.db.getFirstAsync<Record<string, unknown>>(
      `SELECT p.*, c.name AS category_name, s.name AS supplier_name
       FROM products p
       INNER JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.id = ? AND p.workspace_id = ?`,
      [productId, workspaceId]
    );
    if (!prodRow) return null;

    const unitRow = await this.db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM units_of_measure WHERE id = ?',
      [String(prodRow.unit_id)]
    );
    if (!unitRow) throw new Error('Product unit of measure not found.');

    const attrRows = await this.db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM product_attributes WHERE product_id = ? ORDER BY display_order ASC',
      [productId]
    );

    const variantRows = await this.db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM product_variants WHERE product_id = ? ORDER BY created_at ASC',
      [productId]
    );

    const allItems = await this.listInventoryItems({
      workspaceId,
      includeArchived: true,
    });
    const productItems = allItems.filter((i) => i.productId === productId);

    return {
      product: {
        id: String(prodRow.id),
        workspaceId: String(prodRow.workspace_id),
        name: String(prodRow.name),
        sku: String(prodRow.sku),
        barcode: prodRow.barcode ? String(prodRow.barcode) : null,
        categoryId: String(prodRow.category_id),
        subcategoryId: prodRow.subcategory_id
          ? String(prodRow.subcategory_id)
          : null,
        description: prodRow.description ? String(prodRow.description) : null,
        unitId: String(prodRow.unit_id),
        minStockThreshold: Number(prodRow.min_stock_threshold),
        reorderQuantity:
          prodRow.reorder_quantity !== null &&
          prodRow.reorder_quantity !== undefined
            ? Number(prodRow.reorder_quantity)
            : null,
        supplierId: prodRow.supplier_id ? String(prodRow.supplier_id) : null,
        imageUri: prodRow.image_uri ? String(prodRow.image_uri) : null,
        hasVariants: Boolean(prodRow.has_variants),
        isArchived: Boolean(prodRow.is_archived),
        createdAt: String(prodRow.created_at),
        updatedAt: String(prodRow.updated_at),
      },
      categoryName: String(prodRow.category_name),
      unit: {
        id: String(unitRow.id),
        workspaceId: String(unitRow.workspace_id),
        name: String(unitRow.name),
        symbol: String(unitRow.symbol),
        allowFractional: Boolean(unitRow.allow_fractional),
        isCustom: Boolean(unitRow.is_custom),
        isArchived: Boolean(unitRow.is_archived),
        createdAt: String(unitRow.created_at),
        updatedAt: String(unitRow.updated_at),
      },
      supplierName: prodRow.supplier_name
        ? String(prodRow.supplier_name)
        : null,
      attributes: attrRows.map((a) => ({
        id: String(a.id),
        workspaceId: String(a.workspace_id),
        productId: String(a.product_id),
        attributeName: String(a.attribute_name),
        attributeOptions: JSON.parse(String(a.attribute_options_json || '[]')),
        displayOrder: Number(a.display_order),
        createdAt: String(a.created_at),
      })),
      variants: variantRows.map((v) => ({
        id: String(v.id),
        workspaceId: String(v.workspace_id),
        productId: String(v.product_id),
        variantName: String(v.variant_name),
        attributeValues: JSON.parse(String(v.attribute_values_json || '{}')),
        sku: String(v.sku),
        barcode: v.barcode ? String(v.barcode) : null,
        minStockThreshold: Number(v.min_stock_threshold),
        reorderQuantity:
          v.reorder_quantity !== null && v.reorder_quantity !== undefined
            ? Number(v.reorder_quantity)
            : null,
        isArchived: Boolean(v.is_archived),
        createdAt: String(v.created_at),
        updatedAt: String(v.updated_at),
      })),
      items: productItems,
    };
  }

  async findItemByBarcode(
    workspaceId: string,
    barcode: string
  ): Promise<InventoryItemView | null> {
    const clean = barcode.trim();
    if (!clean) return null;
    const allItems = await this.listInventoryItems({
      workspaceId,
      includeArchived: false,
    });
    return allItems.find((item) => item.barcode === clean) ?? null;
  }
}
