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
  const inventoryItems = useAppStore((s) => s.inventoryItems);
  const createProduct = useAppStore((s) => s.createProduct);
  const addCategory = useAppStore((s) => s.addCategory);

  const [showInlineCatModal, setShowInlineCatModal] = useState(false);
  const [inlineCatName, setInlineCatName] = useState('');

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [unitId, setUnitId] = useState(
    profile?.defaultUnitId || units[0]?.id || ''
  );
  const [minStockThreshold, setMinStockThreshold] = useState('5');
  const [openingStock, setOpeningStock] = useState('0');
  const [openingStockDate] = useState(
    getTodayInTimezone(profile?.timezone || 'Asia/Kolkata')
  );

  // Simplified Sizes / Types state
  const [hasVariants, setHasVariants] = useState(false);
  const [sizeInputText, setSizeInputText] = useState('');
  const [variants, setVariants] = useState<
    {
      variantName: string;
      minStockThreshold: string;
      openingStock: string;
    }[]
  >([]);

  // Optional fields collapsed by default
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState(params.barcode || '');
  const [description, setDescription] = useState('');

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

  // Automatically sync variant rows in exact input order whenever sizeInputText changes
  const syncSizesFromText = (rawText: string, defaultMin = minStockThreshold, defaultOpen = openingStock) => {
    setSizeInputText(rawText);
    const parts = rawText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (parts.length === 0) {
      setVariants([]);
      return;
    }

    setVariants((prev) =>
      parts.map((part) => {
        const existing = prev.find((p) => p.variantName === part);
        return {
          variantName: part,
          minStockThreshold: existing?.minStockThreshold ?? (defaultMin || '5'),
          openingStock: existing?.openingStock ?? (defaultOpen || '0'),
        };
      })
    );
  };

  const applySizePreset = (presetCsv: string | null) => {
    if (!presetCsv) {
      setHasVariants(false);
      setSizeInputText('');
      setVariants([]);
      return;
    }
    setHasVariants(true);
    syncSizesFromText(presetCsv);
  };

  const handleSave = async () => {
    setErrorMsg(null);
    if (!name.trim()) {
      setErrorMsg('Please enter the product name.');
      return;
    }

    const baseSku =
      sku.trim() ||
      generateSku(
        name,
        categories.find((c) => c.id === categoryId)?.name,
        undefined,
        inventoryItems.length + 1
      );

    const parsedThreshold = Number(minStockThreshold || 0);
    if (Number.isNaN(parsedThreshold) || parsedThreshold < 0) {
      setErrorMsg('Minimum stock must be 0 or greater.');
      return;
    }

    const parsedOpening =
      openingStock.trim() !== '' ? Number(openingStock) : 0;
    if (Number.isNaN(parsedOpening) || parsedOpening < 0) {
      setErrorMsg('Opening stock cannot be negative.');
      return;
    }

    let variantPayloads: CreateProductVariantInput[] | undefined;
    if (hasVariants) {
      if (variants.length === 0) {
        setErrorMsg(
          'Enter at least one size or type (comma-separated), or choose "Single Item".'
        );
        return;
      }
      variantPayloads = variants.map((v, idx) => {
        const cleanTag =
          v.variantName
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, 4) || `V${idx + 1}`;
        return {
          variantName: v.variantName,
          attributeValues: { Size: v.variantName },
          sku: `${baseSku}-${cleanTag}-${idx + 1}`,
          barcode: null,
          minStockThreshold: Number(v.minStockThreshold || 0),
          openingStock:
            v.openingStock.trim() !== '' ? Number(v.openingStock) : 0,
          reorderQuantity: null,
        };
      });
    }

    setSaving(true);
    try {
      await createProduct({
        name: name.trim(),
        sku: baseSku,
        barcode: barcode.trim() || null,
        categoryId,
        unitId,
        supplierId: null,
        description: description.trim() || null,
        minStockThreshold: parsedThreshold,
        openingStock: hasVariants ? null : parsedOpening,
        openingStockDate,
        reorderQuantity: null,
        hasVariants,
        attributes: hasVariants
          ? [
              {
                attributeName: 'Size / Type',
                attributeOptions: variants.map((v) => v.variantName),
              },
            ]
          : undefined,
        variants: variantPayloads,
      });

      router.replace('/(tabs)/products');
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

        {/* 1. Category & Product Name */}
        <SectionCard style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={styles.labelFirst}>1. Category</Text>
            <TouchableOpacity
              onPress={() => setShowInlineCatModal((v) => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Feather name="plus" size={14} color={palette.primary600} />
              <Text style={styles.linkText}>New Category</Text>
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
            <View style={styles.inlineCatBox}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Category name (e.g., Sarees)"
                placeholderTextColor={palette.slate400}
                value={inlineCatName}
                onChangeText={setInlineCatName}
              />
              <TouchableOpacity
                style={styles.inlineCatSaveBtn}
                onPress={async () => {
                  if (!inlineCatName.trim()) return;
                  try {
                    const createdCat = await addCategory({
                      name: inlineCatName.trim(),
                    });
                    setCategoryId(createdCat.id);
                    setInlineCatName('');
                    setShowInlineCatModal(false);
                  } catch (e) {
                    setErrorMsg((e as Error).message);
                  }
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
                  Add
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <Text style={styles.label}>2. Product / Item Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Floral Kurti, Denim Pant, Cotton Nighty, Silk Saree"
            placeholderTextColor={palette.slate400}
            value={name}
            onChangeText={setName}
          />
        </SectionCard>

        {/* 2. Sizes / Types */}
        <SectionCard style={styles.section}>
          <Text style={styles.labelFirst}>3. Sizes or Types</Text>
          <Text style={styles.helperText}>
            Pick a preset or enter custom sizes. Order is kept exactly as entered.
          </Text>

          <View style={[styles.chipWrap, { marginTop: spacing.sm }]}>
            {[
              { label: 'Single Item (No Sizes)', value: null },
              { label: 'Dress / Top (S–XXL)', value: 'S, M, L, XL, XXL' },
              { label: 'Pants (30–40)', value: '30, 32, 34, 36, 38, 40' },
              { label: 'Nighty (Elastic, Zip, Button)', value: 'Elastic, Zip, Button' },
            ].map((preset) => {
              const active =
                preset.value === null
                  ? !hasVariants
                  : hasVariants && sizeInputText === preset.value;
              return (
                <TouchableOpacity
                  key={preset.label}
                  onPress={() => applySizePreset(preset.value)}
                  style={[styles.chip, active && styles.chipSelected]}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextSelected]}
                  >
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {hasVariants ? (
            <View style={{ marginTop: spacing.md }}>
              <Text style={styles.label}>
                Sizes / Types (comma-separated in your preferred order)
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., S, M, L, XL, XXL"
                placeholderTextColor={palette.slate400}
                value={sizeInputText}
                onChangeText={(txt) => syncSizesFromText(txt)}
              />

              {variants.length > 0 ? (
                <View style={{ marginTop: spacing.md, gap: 8 }}>
                  <View style={styles.variantHeaderRow}>
                    <Text style={[styles.colHeader, { flex: 1.2 }]}>
                      Size / Type
                    </Text>
                    <Text style={[styles.colHeader, { flex: 1 }]}>
                      Opening Stock
                    </Text>
                    <Text style={[styles.colHeader, { flex: 1 }]}>
                      Min Alert
                    </Text>
                  </View>
                  {variants.map((v, idx) => (
                    <View key={`${v.variantName}_${idx}`} style={styles.variantRow}>
                      <Text style={[styles.variantNameText, { flex: 1.2 }]}>
                        {v.variantName}
                      </Text>
                      <TextInput
                        style={[styles.smallInput, { flex: 1 }]}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        value={v.openingStock}
                        onChangeText={(val) =>
                          setVariants((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, openingStock: val } : item
                            )
                          )
                        }
                      />
                      <TextInput
                        style={[styles.smallInput, { flex: 1 }]}
                        keyboardType="decimal-pad"
                        placeholder="5"
                        value={v.minStockThreshold}
                        onChangeText={(val) =>
                          setVariants((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, minStockThreshold: val }
                                : item
                            )
                          )
                        }
                      />
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : (
            <View style={[styles.row, { marginTop: spacing.md }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Opening Stock</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  value={openingStock}
                  onChangeText={setOpeningStock}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Min Stock Alert</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  placeholder="5"
                  value={minStockThreshold}
                  onChangeText={setMinStockThreshold}
                />
              </View>
            </View>
          )}
        </SectionCard>

        {/* Optional Advanced Fields */}
        <TouchableOpacity
          style={styles.advancedToggle}
          onPress={() => setShowAdvanced((v) => !v)}
        >
          <Feather
            name={showAdvanced ? 'chevron-up' : 'chevron-down'}
            size={15}
            color={palette.slate600}
          />
          <Text style={styles.advancedToggleText}>
            {showAdvanced
              ? 'Hide Optional Details'
              : 'Optional Details (Unit, Custom SKU, Notes)'}
          </Text>
        </TouchableOpacity>

        {showAdvanced ? (
          <SectionCard style={styles.section}>
            <Text style={styles.labelFirst}>Unit</Text>
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

            <Text style={styles.label}>Custom SKU (Auto-generated if blank)</Text>
            <TextInput
              style={styles.input}
              placeholder="Auto-generated"
              placeholderTextColor={palette.slate400}
              value={sku}
              onChangeText={setSku}
              autoCapitalize="characters"
            />

            <Text style={styles.label}>Notes / Description</Text>
            <TextInput
              style={styles.input}
              placeholder="Optional product notes..."
              placeholderTextColor={palette.slate400}
              value={description}
              onChangeText={setDescription}
            />
          </SectionCard>
        ) : null}

        <PrimaryButton
          title="Save Product"
          icon="check"
          loading={saving}
          onPress={handleSave}
          style={{ marginTop: spacing.sm }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function getStyles() {
  return StyleSheet.create({
    scrollContent: {
      padding: spacing.md,
      paddingBottom: 40,
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: palette.danger50,
      borderColor: palette.danger100,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    errorText: {
      flex: 1,
      color: palette.danger700,
      fontSize: 13,
      fontWeight: '600',
    },
    section: {
      marginBottom: spacing.md,
    },
    rowBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    labelFirst: {
      fontSize: 14,
      fontWeight: '700',
      color: palette.slate900,
      marginBottom: 6,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: palette.slate700,
      marginTop: spacing.md,
      marginBottom: 4,
    },
    helperText: {
      fontSize: 12,
      color: palette.slate500,
    },
    linkText: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.primary600,
    },
    input: {
      borderWidth: 1,
      borderColor: palette.slate300,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      fontSize: 14,
      color: palette.slate900,
      backgroundColor: palette.slate50,
    },
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    chip: {
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: palette.slate300,
      backgroundColor: palette.slate50,
    },
    chipSelected: {
      backgroundColor: palette.primary600,
      borderColor: palette.primary600,
    },
    chipText: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.slate700,
    },
    chipTextSelected: {
      color: '#FFFFFF',
    },
    inlineCatBox: {
      flexDirection: 'row',
      gap: 8,
      marginTop: spacing.sm,
      alignItems: 'center',
    },
    inlineCatSaveBtn: {
      backgroundColor: palette.primary600,
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: radius.md,
    },
    variantHeaderRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 4,
    },
    colHeader: {
      fontSize: 11,
      fontWeight: '700',
      color: palette.slate500,
    },
    variantRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: palette.slate50,
      padding: 8,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: palette.slate200,
    },
    variantNameText: {
      fontSize: 14,
      fontWeight: '700',
      color: palette.slate900,
    },
    smallInput: {
      borderWidth: 1,
      borderColor: palette.slate300,
      borderRadius: radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontSize: 14,
      fontWeight: '700',
      color: palette.slate900,
      backgroundColor: palette.white,
      textAlign: 'center',
    },
    advancedToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      marginBottom: spacing.xs,
    },
    advancedToggleText: {
      fontSize: 12,
      fontWeight: '600',
      color: palette.slate600,
    },
  });
}
