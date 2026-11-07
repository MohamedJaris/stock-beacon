import {
  PrimaryButton,
  SectionCard,
} from '@/components/common/AppComponents';
import { getTodayInTimezone } from '@/core/utils/dateUtils';
import { generateSku } from '@/core/utils/skuGenerator';
import { CreateProductVariantInput } from '@/data/repositories/SqliteCatalogRepository';
import { useAppStore } from '@/stores/useAppStore';
import { palette, radius, spacing } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function AddProductScreen() {
  const styles = getStyles();
  const router = useRouter();
  const params = useLocalSearchParams<{ barcode?: string }>();

  const profile = useAppStore((s) => s.profile);
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const categories = useAppStore((s) => s.categories);
  const units = useAppStore((s) => s.units);
  const suppliers = useAppStore((s) => s.suppliers);
  const inventoryItems = useAppStore((s) => s.inventoryItems);
  const createProduct = useAppStore((s) => s.createProduct);
  const addCategory = useAppStore((s) => s.addCategory);

  const [showInlineCatModal, setShowInlineCatModal] = useState(false);
  const [inlineCatName, setInlineCatName] = useState('');
  const [inlineCatDesc, setInlineCatDesc] = useState('');

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState(params.barcode || '');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [unitId, setUnitId] = useState(
    profile?.defaultUnitId || units[0]?.id || ''
  );
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [minStockThreshold, setMinStockThreshold] = useState('10');
  const [reorderQuantity, setReorderQuantity] = useState('');
  const [recordOpeningNow, setRecordOpeningNow] = useState(true);
  const [openingStock, setOpeningStock] = useState('0');
  const [openingStockDate, setOpeningStockDate] = useState(
    getTodayInTimezone(profile?.timezone || 'Asia/Kolkata')
  );

  // Variant configuration
  const [hasVariants, setHasVariants] = useState(false);
  const [attr1Name, setAttr1Name] = useState('Size');
  const [attr1Options, setAttr1Options] = useState('S, M, L, XL, XXL');
  const [attr2Name, setAttr2Name] = useState('');
  const [attr2Options, setAttr2Options] = useState('');
  const [variants, setVariants] = useState<
    {
      variantName: string;
      attributeValues: Record<string, string>;
      sku: string;
      barcode: string;
      minStockThreshold: string;
      openingStock: string;
    }[]
  >([]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!categoryId && categories.length > 0) {
      setCategoryId(categories[0].id);
    }
    if (!unitId && units.length > 0) {
      setUnitId(profile?.defaultUnitId || units[0].id);
    }
  }, [categories, units, categoryId, unitId, profile]);

  const handleAutoSku = () => {
    const cat = categories.find((c) => c.id === categoryId);
    const generated = generateSku(
      name || 'ITEM',
      cat?.name,
      undefined,
      inventoryItems.length + 1
    );
    setSku(generated);
  };

  const handleGenerateVariantCombinations = () => {
    const opts1 = attr1Options
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const opts2 = attr2Options
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (opts1.length === 0) {
      setErrorMsg('Please enter at least one option for Attribute 1.');
      return;
    }

    const baseSku =
      sku.trim() ||
      generateSku(
        name || 'ITEM',
        categories.find((c) => c.id === categoryId)?.name,
        undefined,
        inventoryItems.length + 1
      );
    if (!sku.trim()) setSku(baseSku);

    const generated: typeof variants = [];
    let idx = 1;

    if (opts2.length === 0 || !attr2Name.trim()) {
      for (const o1 of opts1) {
        generated.push({
          variantName: o1,
          attributeValues: { [attr1Name.trim() || 'Option']: o1 },
          sku: `${baseSku}-${o1.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)}-${idx}`,
          barcode: '',
          minStockThreshold: minStockThreshold || '10',
          openingStock: recordOpeningNow ? openingStock || '0' : '',
        });
        idx++;
      }
    } else {
      for (const o1 of opts1) {
        for (const o2 of opts2) {
          const vName = `${o1} / ${o2}`;
          const s1 = o1.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2);
          const s2 = o2.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2);
          generated.push({
            variantName: vName,
            attributeValues: {
              [attr1Name.trim() || 'Attr1']: o1,
              [attr2Name.trim() || 'Attr2']: o2,
            },
            sku: `${baseSku}-${s1}${s2}-${idx}`,
            barcode: '',
            minStockThreshold: minStockThreshold || '10',
            openingStock: recordOpeningNow ? openingStock || '0' : '',
          });
          idx++;
        }
      }
    }
    setVariants(generated);
  };

  const handleSave = async () => {
    setErrorMsg(null);
    if (!name.trim()) {
      setErrorMsg('Product name is required.');
      return;
    }
    const finalSku =
      sku.trim() ||
      generateSku(
        name,
        categories.find((c) => c.id === categoryId)?.name,
        undefined,
        inventoryItems.length + 1
      );

    const parsedThreshold = Number(minStockThreshold);
    if (Number.isNaN(parsedThreshold) || parsedThreshold < 0) {
      setErrorMsg('Minimum stock threshold must be 0 or greater.');
      return;
    }

    const parsedOpening =
      recordOpeningNow && openingStock.trim() !== ''
        ? Number(openingStock)
        : null;
    if (parsedOpening !== null && (Number.isNaN(parsedOpening) || parsedOpening < 0)) {
      setErrorMsg('Opening stock quantity cannot be negative.');
      return;
    }

    const parsedReorder =
      reorderQuantity.trim() !== '' ? Number(reorderQuantity) : null;

    let variantPayloads: CreateProductVariantInput[] | undefined;
    if (hasVariants) {
      if (variants.length === 0) {
        setErrorMsg(
          'Please click "Generate Variant List" or disable variants.'
        );
        return;
      }
      variantPayloads = variants.map((v) => ({
        variantName: v.variantName,
        attributeValues: v.attributeValues,
        sku: v.sku.trim(),
        barcode: v.barcode.trim() || null,
        minStockThreshold: Number(v.minStockThreshold || 0),
        openingStock:
          v.openingStock.trim() !== '' ? Number(v.openingStock) : null,
        reorderQuantity: parsedReorder,
      }));
    }

    setSaving(true);
    try {
      const created = await createProduct({
        name: name.trim(),
        sku: finalSku,
        barcode: barcode.trim() || null,
        categoryId,
        unitId,
        supplierId,
        description: description.trim() || null,
        minStockThreshold: parsedThreshold,
        openingStock: hasVariants ? null : parsedOpening,
        openingStockDate,
        reorderQuantity: parsedReorder,
        hasVariants,
        attributes: hasVariants
          ? [
              {
                attributeName: attr1Name.trim() || 'Option 1',
                attributeOptions: attr1Options
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              },
              ...(attr2Name.trim() && attr2Options.trim()
                ? [
                    {
                      attributeName: attr2Name.trim(),
                      attributeOptions: attr2Options
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                  ]
                : []),
            ]
          : undefined,
        variants: variantPayloads,
      });

      router.replace(`/product/${created.product.id}`);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.slate50 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {errorMsg ? (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={16} color={palette.danger700} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        <SectionCard style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Product Details</Text>

          <Text style={styles.label}>Product Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Cotton Formal Shirt, A4 Copier Paper 75 GSM"
            value={name}
            onChangeText={setName}
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Unique SKU *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., SHIRT-COT-001"
                value={sku}
                onChangeText={setSku}
                autoCapitalize="characters"
              />
            </View>
            <TouchableOpacity
              onPress={handleAutoSku}
              style={styles.autoSkuBtn}
            >
              <Feather name="zap" size={14} color={palette.primary600} />
              <Text style={styles.autoSkuText}>Auto SKU</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Barcode (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="EAN / UPC / Code 128 barcode"
            value={barcode}
            onChangeText={setBarcode}
          />

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: spacing.md,
            }}
          >
            <Text style={[styles.label, { marginTop: 0 }]}>Category *</Text>
            <TouchableOpacity
              onPress={() => setShowInlineCatModal(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Feather name="plus-circle" size={14} color={palette.primary600} />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: palette.primary600,
                }}
              >
                + Add / Edit Categories
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.chipWrap}>
            {categories.map((cat) => {
              const selected = categoryId === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setCategoryId(cat.id)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected && styles.chipTextSelected,
                    ]}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {showInlineCatModal ? (
            <View style={styles.variantBox}>
              <Text style={styles.variantHeader}>Quick Add New Category</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Ready-Made Dresses, Pants, Nighties, Tops, Sarees"
                value={inlineCatName}
                onChangeText={setInlineCatName}
              />
              <TextInput
                style={[styles.input, { marginTop: 6 }]}
                placeholder="Optional description"
                value={inlineCatDesc}
                onChangeText={setInlineCatDesc}
              />
              <View style={[styles.row, { marginTop: 8 }]}>
                <PrimaryButton
                  title="Cancel"
                  variant="outline"
                  onPress={() => setShowInlineCatModal(false)}
                  style={{ flex: 1 }}
                />
                <PrimaryButton
                  title="Create & Select"
                  onPress={async () => {
                    if (!inlineCatName.trim()) return;
                    try {
                      const createdCat = await addCategory({
                        name: inlineCatName.trim(),
                        description: inlineCatDesc.trim() || undefined,
                      });
                      setCategoryId(createdCat.id);
                      setInlineCatName('');
                      setInlineCatDesc('');
                      setShowInlineCatModal(false);
                    } catch (e) {
                      setErrorMsg((e as Error).message);
                    }
                  }}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : null}

          <Text style={styles.label}>Unit of Measurement *</Text>
          <View style={styles.chipWrap}>
            {units.map((u) => {
              const selected = unitId === u.id;
              return (
                <TouchableOpacity
                  key={u.id}
                  onPress={() => setUnitId(u.id)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected && styles.chipTextSelected,
                    ]}
                  >
                    {u.name} ({u.symbol})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {suppliers.length > 0 ? (
            <>
              <Text style={styles.label}>Default Supplier (Optional)</Text>
              <View style={styles.chipWrap}>
                <TouchableOpacity
                  onPress={() => setSupplierId(null)}
                  style={[
                    styles.chip,
                    supplierId === null && styles.chipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      supplierId === null && styles.chipTextSelected,
                    ]}
                  >
                    None
                  </Text>
                </TouchableOpacity>
                {suppliers.map((sup) => {
                  const selected = supplierId === sup.id;
                  return (
                    <TouchableOpacity
                      key={sup.id}
                      onPress={() => setSupplierId(sup.id)}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selected && styles.chipTextSelected,
                        ]}
                      >
                        {sup.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : null}

          <Text style={styles.label}>Description / Notes (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Brand, specifications, rack location..."
            value={description}
            onChangeText={setDescription}
          />
        </SectionCard>

        {/* Threshold & Opening Stock */}
        <SectionCard style={styles.section}>
          <Text style={styles.sectionTitle}>
            Threshold & Opening Stock Baseline
          </Text>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Minimum Stock Threshold *</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={minStockThreshold}
                onChangeText={setMinStockThreshold}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Suggested Reorder Qty</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                placeholder="Optional"
                value={reorderQuantity}
                onChangeText={setReorderQuantity}
              />
            </View>
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Record Opening Stock Baseline Now?</Text>
              <Text style={styles.helperText}>
                If disabled, initial status will be "No Baseline (UNKNOWN)" until an opening stock or physical count is recorded.
              </Text>
            </View>
            <Switch
              value={recordOpeningNow}
              onValueChange={setRecordOpeningNow}
            />
          </View>

          {recordOpeningNow && !hasVariants ? (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Opening Stock Quantity</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={openingStock}
                  onChangeText={setOpeningStock}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Opening Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={openingStockDate}
                  onChangeText={setOpeningStockDate}
                />
              </View>
            </View>
          ) : null}
        </SectionCard>

        {/* Optional Product Variants */}
        <SectionCard style={styles.section}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>
                Enable Product Variants (Optional)
              </Text>
              <Text style={styles.helperText}>
                For items tracked by Size, Colour, Grade, Capacity, or Material. Each variant gets its own SKU, threshold, and stock ledger.
              </Text>
            </View>
            <Switch value={hasVariants} onValueChange={setHasVariants} />
          </View>

          {hasVariants ? (
            <View style={{ marginTop: spacing.md }}>
              <Text style={styles.smallLabel}>
                Quick Shop Size / Type Presets (Maintained in exact input order)
              </Text>
              <View style={[styles.chipWrap, { marginBottom: spacing.md }]}>
                {[
                  {
                    label: 'Dresses / Tops (S, M, L, XL, XXL)',
                    attrName: 'Size',
                    options: 'S, M, L, XL, XXL',
                  },
                  {
                    label: 'Pants / Jeans (30, 32, 34, 36, 38, 40)',
                    attrName: 'Waist Size',
                    options: '30, 32, 34, 36, 38, 40',
                  },
                  {
                    label: 'Nighties (Elastic, Zip, Button)',
                    attrName: 'Nighty Type',
                    options: 'Elastic, Zip, Button',
                  },
                  {
                    label: 'Saree Styles (Silk, Cotton, Fancy)',
                    attrName: 'Saree Type',
                    options: 'Silk, Cotton, Fancy',
                  },
                ].map((preset) => (
                  <TouchableOpacity
                    key={preset.label}
                    onPress={() => {
                      setAttr1Name(preset.attrName);
                      setAttr1Options(preset.options);
                    }}
                    style={[
                      styles.chip,
                      attr1Options === preset.options && styles.chipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        attr1Options === preset.options &&
                          styles.chipTextSelected,
                      ]}
                    >
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Attribute 1 Name</Text>
                  <TextInput
                    style={styles.input}
                    value={attr1Name}
                    onChangeText={setAttr1Name}
                    placeholder="e.g., Size or Type"
                  />
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={styles.label}>
                    Sizes / Types (in exact order)
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={attr1Options}
                    onChangeText={setAttr1Options}
                    placeholder="S, M, L, XL, XXL"
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Attribute 2 Name (Optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={attr2Name}
                    onChangeText={setAttr2Name}
                    placeholder="e.g., Colour"
                  />
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={styles.label}>Options (comma-separated)</Text>
                  <TextInput
                    style={styles.input}
                    value={attr2Options}
                    onChangeText={setAttr2Options}
                    placeholder="Blue, Black"
                  />
                </View>
              </View>

              <PrimaryButton
                title="Generate Variant Combinations"
                variant="secondary"
                icon="grid"
                onPress={handleGenerateVariantCombinations}
                style={{ marginTop: spacing.md }}
              />

              {variants.map((v, idx) => (
                <View key={v.variantName} style={styles.variantBox}>
                  <Text style={styles.variantHeader}>{v.variantName}</Text>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.smallLabel}>Variant SKU</Text>
                      <TextInput
                        style={styles.input}
                        value={v.sku}
                        onChangeText={(val) => {
                          const next = [...variants];
                          next[idx].sku = val;
                          setVariants(next);
                        }}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.smallLabel}>Min Threshold</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="decimal-pad"
                        value={v.minStockThreshold}
                        onChangeText={(val) => {
                          const next = [...variants];
                          next[idx].minStockThreshold = val;
                          setVariants(next);
                        }}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.smallLabel}>Opening Stock</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="decimal-pad"
                        placeholder="None"
                        value={v.openingStock}
                        onChangeText={(val) => {
                          const next = [...variants];
                          next[idx].openingStock = val;
                          setVariants(next);
                        }}
                      />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </SectionCard>

        <PrimaryButton
          title="Save Product to Inventory"
          icon="check"
          loading={saving}
          onPress={handleSave}
          style={{ marginBottom: spacing.xxxl }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function getStyles() {
  return StyleSheet.create({
    scrollContent: {
      padding: spacing.lg,
    },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.slate900,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.slate700,
    marginTop: spacing.md,
    marginBottom: 4,
  },
  smallLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: palette.slate600,
    marginBottom: 2,
  },
  helperText: {
    fontSize: 12,
    color: palette.slate500,
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.slate300,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    fontSize: 14,
    color: palette.slate900,
    backgroundColor: palette.slate50,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-end',
  },
  autoSkuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: palette.primary50,
    borderWidth: 1,
    borderColor: palette.primary100,
  },
  autoSkuText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.primary600,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: 4,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.slate300,
    backgroundColor: palette.white,
  },
  chipSelected: {
    backgroundColor: palette.primary600,
    borderColor: palette.primary600,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.slate700,
  },
  chipTextSelected: {
    color: palette.white,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  variantBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.slate100,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.slate200,
  },
  variantHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.slate900,
    marginBottom: 6,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.danger50,
    borderColor: palette.danger100,
    borderWidth: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
    errorText: {
      color: palette.danger700,
      fontSize: 13,
      fontWeight: '600',
      flex: 1,
    },
  });
}
