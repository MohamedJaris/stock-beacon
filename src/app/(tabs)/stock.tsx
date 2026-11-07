import {
  EmptyStateView,
  PrimaryButton,
  SectionCard,
} from '@/components/common/AppComponents';
import {
  ProvenanceBadge,
  StockStatusBadge,
} from '@/components/inventory/StatusBadge';
import { formatDisplayDate, getTodayInTimezone } from '@/core/utils/dateUtils';
import {
  addQuantities,
  formatQuantity,
  subtractQuantities,
} from '@/core/utils/quantityMath';
import { STOCK_ADJUSTMENT_REASONS } from '@/domain/enums';
import { useAppStore } from '@/stores/useAppStore';
import { palette, radius, spacing } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type StockTab = 'inward' | 'count' | 'adjustment' | 'ledger';
type ActiveDropdown = 'category' | 'product' | 'variant' | null;

export default function StockOperationsScreen() {
  const styles = getStyles();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: StockTab; itemKey?: string }>();

  const profile = useAppStore((s) => s.profile);
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const inventoryItems = useAppStore((s) => s.inventoryItems);
  const categories = useAppStore((s) => s.categories);
  const suppliers = useAppStore((s) => s.suppliers);
  const recentEvents = useAppStore((s) => s.recentEvents);
  const recordStockInward = useAppStore((s) => s.recordStockInward);
  const recordBatchPhysicalCount = useAppStore(
    (s) => s.recordBatchPhysicalCount
  );
  const recordStockAdjustment = useAppStore((s) => s.recordStockAdjustment);

  const today = getTodayInTimezone(profile?.timezone || 'Asia/Kolkata');

  const [activeTab, setActiveTab] = useState<StockTab>(params.tab || 'inward');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // --- Cascading Quick Filter Dropdown State (Category -> Product -> Size/Type) ---
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);
  const [filterProductId, setFilterProductId] = useState<string | null>(null);
  const [filterVariantOption, setFilterVariantOption] = useState<string | null>(
    null
  );
  const [openDropdown, setOpenDropdown] = useState<ActiveDropdown>(null);
  const [sortBy, setSortBy] = useState<'input_order' | 'name'>('input_order');

  // --- Workflow A: Stock Inward State ---
  const [inwardItemKey, setInwardItemKey] = useState<string>(
    params.itemKey || inventoryItems[0]?.itemKey || ''
  );
  const [inwardSearch, setInwardSearch] = useState('');
  const [inwardQty, setInwardQty] = useState('');
  const [inwardDate, setInwardDate] = useState(today);
  const [inwardSupplierId, setInwardSupplierId] = useState<string | null>(null);
  const [inwardRef, setInwardRef] = useState('');
  const [inwardNotes, setInwardNotes] = useState('');
  const [submittingInward, setSubmittingInward] = useState(false);

  // --- Workflow B: Daily Physical Stock Count State ---
  const [countDate, setCountDate] = useState(today);
  const [countSearch, setCountSearch] = useState('');
  const [countCategoryId, setCountCategoryId] = useState<string | null>(null);
  const [countInputs, setCountInputs] = useState<Record<string, string>>({});
  const [countSessionNotes, setCountSessionNotes] = useState('');
  const [submittingCount, setSubmittingCount] = useState(false);

  // --- Workflow D: Controlled Stock Adjustment State ---
  const [adjItemKey, setAdjItemKey] = useState<string>(
    params.itemKey || inventoryItems[0]?.itemKey || ''
  );
  const [adjDelta, setAdjDelta] = useState('');
  const [adjReason, setAdjReason] = useState<string>(
    STOCK_ADJUSTMENT_REASONS[0]
  );
  const [adjDate, setAdjDate] = useState(today);
  const [adjNotes, setAdjNotes] = useState('');
  const [submittingAdj, setSubmittingAdj] = useState(false);

  useEffect(() => {
    if (params.tab) {
      setActiveTab(params.tab);
    }
    if (params.itemKey) {
      setInwardItemKey(params.itemKey);
      setAdjItemKey(params.itemKey);
      const matched = inventoryItems.find((i) => i.itemKey === params.itemKey);
      if (matched) {
        setFilterCategoryId(matched.categoryId);
        setFilterProductId(matched.productId);
        setFilterVariantOption(matched.variantName);
      }
    }
  }, [params.tab, params.itemKey, inventoryItems]);

  useEffect(() => {
    if (!inwardItemKey && inventoryItems.length > 0) {
      setInwardItemKey(inventoryItems[0].itemKey);
    }
    if (!adjItemKey && inventoryItems.length > 0) {
      setAdjItemKey(inventoryItems[0].itemKey);
    }
  }, [inventoryItems, inwardItemKey, adjItemKey]);

  // Distinct products for the Quick Product Dropdown (filtered by selected category if any)
  const availableProducts = useMemo(() => {
    const map = new Map<
      string,
      { productId: string; productName: string; categoryId: string }
    >();
    for (const item of inventoryItems) {
      if (filterCategoryId && item.categoryId !== filterCategoryId) {
        continue;
      }
      if (!map.has(item.productId)) {
        map.set(item.productId, {
          productId: item.productId,
          productName: item.productName,
          categoryId: item.categoryId,
        });
      }
    }
    return Array.from(map.values());
  }, [inventoryItems, filterCategoryId]);

  // Distinct sizes / variant names in EXACT input order (never alphabetically scrambled!)
  const availableVariantOptions = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];

    const sourceItems = [...inventoryItems]
      .filter((item) => {
        if (filterCategoryId && item.categoryId !== filterCategoryId) {
          return false;
        }
        if (filterProductId && item.productId !== filterProductId) {
          return false;
        }
        return Boolean(item.variantName);
      })
      .sort((a, b) => (a.variantSortOrder ?? 0) - (b.variantSortOrder ?? 0));

    for (const item of sourceItems) {
      if (item.variantName && !seen.has(item.variantName)) {
        seen.add(item.variantName);
        ordered.push(item.variantName);
      }
    }
    return ordered;
  }, [inventoryItems, filterCategoryId, filterProductId]);

  const selectedCategoryName =
    categories.find((c) => c.id === filterCategoryId)?.name || 'All Categories';
  const selectedProductName =
    availableProducts.find((p) => p.productId === filterProductId)
      ?.productName || 'All Items / Styles';

  const selectedInwardItem = inventoryItems.find(
    (i) => i.itemKey === inwardItemKey
  );
  const selectedAdjItem = inventoryItems.find((i) => i.itemKey === adjItemKey);

  const filteredInwardPickerItems = useMemo(() => {
    const q = inwardSearch.trim().toLowerCase();
    const list = inventoryItems.filter((item) => {
      if (filterCategoryId && item.categoryId !== filterCategoryId) {
        return false;
      }
      if (filterProductId && item.productId !== filterProductId) {
        return false;
      }
      if (filterVariantOption && item.variantName !== filterVariantOption) {
        return false;
      }
      if (q) {
        const matchName = item.displayName.toLowerCase().includes(q);
        const matchSku = item.sku.toLowerCase().includes(q);
        const matchBarcode = item.barcode?.toLowerCase().includes(q) ?? false;
        if (!matchName && !matchSku && !matchBarcode) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'name') {
        return a.displayName.localeCompare(b.displayName);
      }
      if (a.productId === b.productId) {
        return (a.variantSortOrder ?? 0) - (b.variantSortOrder ?? 0);
      }
      return 0;
    });

    return list;
  }, [
    inventoryItems,
    inwardSearch,
    filterCategoryId,
    filterProductId,
    filterVariantOption,
    sortBy,
  ]);

  // Automatically sync selected inwardItemKey & adjItemKey when filters narrow down the matching items
  const selectFirstMatchingItem = (
    catId: string | null,
    prodId: string | null,
    variantOpt: string | null
  ) => {
    const matching = [...inventoryItems]
      .filter((item) => {
        if (catId && item.categoryId !== catId) return false;
        if (prodId && item.productId !== prodId) return false;
        if (variantOpt && item.variantName !== variantOpt) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.productId === b.productId) {
          return (a.variantSortOrder ?? 0) - (b.variantSortOrder ?? 0);
        }
        return 0;
      });
    if (matching.length > 0) {
      setInwardItemKey(matching[0].itemKey);
      setAdjItemKey(matching[0].itemKey);
    }
  };

  const filteredCountItems = useMemo(() => {
    const q = countSearch.trim().toLowerCase();
    const list = inventoryItems.filter((i) => {
      const effectiveCatId = countCategoryId ?? filterCategoryId;
      if (effectiveCatId && i.categoryId !== effectiveCatId) return false;
      if (filterProductId && i.productId !== filterProductId) return false;
      if (filterVariantOption && i.variantName !== filterVariantOption) {
        return false;
      }
      if (q) {
        return (
          i.displayName.toLowerCase().includes(q) ||
          i.sku.toLowerCase().includes(q)
        );
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'name') {
        return a.displayName.localeCompare(b.displayName);
      }
      if (a.productId === b.productId) {
        return (a.variantSortOrder ?? 0) - (b.variantSortOrder ?? 0);
      }
      return 0;
    });

    return list;
  }, [
    inventoryItems,
    countCategoryId,
    filterCategoryId,
    filterProductId,
    filterVariantOption,
    countSearch,
    sortBy,
  ]);

  const handleInwardSubmit = async () => {
    setFeedback(null);
    if (!selectedInwardItem) {
      setFeedback({
        type: 'error',
        message: 'Please select a product or variant.',
      });
      return;
    }
    const qty = Number(inwardQty);
    if (!qty || Number.isNaN(qty) || qty <= 0) {
      setFeedback({
        type: 'error',
        message: 'Quantity received must be greater than zero.',
      });
      return;
    }
    setSubmittingInward(true);
    try {
      await recordStockInward({
        itemKey: selectedInwardItem.itemKey,
        productId: selectedInwardItem.productId,
        variantId: selectedInwardItem.variantId,
        quantity: qty,
        eventDate: inwardDate,
        supplierId: inwardSupplierId,
        referenceNumber: inwardRef.trim() || null,
        notes: inwardNotes.trim() || null,
      });
      setInwardQty('');
      setInwardRef('');
      setInwardNotes('');
      setFeedback({
        type: 'success',
        message: `Recorded +${formatQuantity(
          qty,
          selectedInwardItem.unitSymbol
        )} inward stock for ${selectedInwardItem.displayName}.`,
      });
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setSubmittingInward(false);
    }
  };

  const handleBatchPhysicalCountSubmit = async () => {
    setFeedback(null);
    const entries: {
      itemKey: string;
      productId: string;
      variantId: string | null;
      countedQuantity: number;
    }[] = [];

    for (const [itemKey, rawStr] of Object.entries(countInputs)) {
      if (rawStr.trim() === '') continue;
      const num = Number(rawStr);
      if (Number.isNaN(num) || num < 0) {
        setFeedback({
          type: 'error',
          message: 'All entered physical count quantities must be 0 or greater.',
        });
        return;
      }
      const meta = inventoryItems.find((i) => i.itemKey === itemKey);
      if (meta) {
        entries.push({
          itemKey: meta.itemKey,
          productId: meta.productId,
          variantId: meta.variantId,
          countedQuantity: num,
        });
      }
    }

    if (entries.length === 0) {
      setFeedback({
        type: 'error',
        message:
          'Enter at least one observed physical count quantity before saving.',
      });
      return;
    }

    setSubmittingCount(true);
    try {
      await recordBatchPhysicalCount({
        eventDate: countDate,
        sessionNotes: countSessionNotes.trim() || null,
        entries,
      });
      setCountInputs({});
      setCountSessionNotes('');
      setFeedback({
        type: 'success',
        message: `Saved verified physical stock count for ${entries.length} item(s) on ${countDate}.`,
      });
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setSubmittingCount(false);
    }
  };

  const handleAdjustmentSubmit = async () => {
    setFeedback(null);
    if (!selectedAdjItem) {
      setFeedback({
        type: 'error',
        message: 'Please select a product or variant.',
      });
      return;
    }
    const delta = Number(adjDelta);
    if (Number.isNaN(delta) || delta === 0) {
      setFeedback({
        type: 'error',
        message: 'Enter a non-zero quantity difference (e.g., -2 or +5).',
      });
      return;
    }
    setSubmittingAdj(true);
    try {
      await recordStockAdjustment({
        itemKey: selectedAdjItem.itemKey,
        productId: selectedAdjItem.productId,
        variantId: selectedAdjItem.variantId,
        quantityDelta: delta,
        reason: adjReason,
        eventDate: adjDate,
        notes: adjNotes.trim() || null,
      });
      setAdjDelta('');
      setAdjNotes('');
      setFeedback({
        type: 'success',
        message: `Recorded stock adjustment (${
          delta > 0 ? `+${delta}` : delta
        } ${selectedAdjItem.unitSymbol}) for ${selectedAdjItem.displayName}.`,
      });
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setSubmittingAdj(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* 4 Stock Sub-Tabs */}
      <View style={styles.tabBar}>
        {(
          [
            { key: 'inward', label: 'Stock Inward' },
            { key: 'count', label: 'Physical Count' },
            { key: 'adjustment', label: 'Adjustment' },
            { key: 'ledger', label: 'Ledger' },
          ] as { key: StockTab; label: string }[]
        ).map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => {
              setFeedback(null);
              setActiveTab(t.key);
            }}
            style={[
              styles.tabBtn,
              activeTab === t.key && styles.tabBtnActive,
            ]}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === t.key && styles.tabTextActive,
              ]}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {feedback ? (
          <View
            style={[
              styles.feedbackBanner,
              feedback.type === 'success'
                ? styles.feedbackSuccess
                : styles.feedbackError,
            ]}
          >
            <Feather
              name={
                feedback.type === 'success' ? 'check-circle' : 'alert-circle'
              }
              size={16}
              color={
                feedback.type === 'success'
                  ? palette.success700
                  : palette.danger700
              }
            />
            <Text
              style={[
                styles.feedbackText,
                {
                  color:
                    feedback.type === 'success'
                      ? palette.success700
                      : palette.danger700,
                },
              ]}
            >
              {feedback.message}
            </Text>
          </View>
        ) : null}

        {inventoryItems.length === 0 ? (
          <EmptyStateView
            icon="package"
            title="No Products Available"
            message="Add at least one product before recording incoming deliveries or physical stock counts."
            actionTitle="Add Product"
            onActionPress={() => router.push('/product/new')}
          />
        ) : null}

        {/* ================================================================
            QUICK ITEM PICKER DROPDOWN BAR (1. Category -> 2. Product -> 3. Size / Type)
           ================================================================ */}
        {activeTab !== 'ledger' && inventoryItems.length > 0 ? (
          <SectionCard style={styles.quickFilterCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.quickFilterHeader}>
                Quick Shop Filter (Category → Product → Size / Type)
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity
                  onPress={() =>
                    setSortBy((prev) =>
                      prev === 'input_order' ? 'name' : 'input_order'
                    )
                  }
                  style={styles.sortToggleChip}
                >
                  <Feather name="sliders" size={11} color={palette.primary600} />
                  <Text style={styles.sortToggleText}>
                    {sortBy === 'input_order' ? 'Input Size Order' : 'A–Z Order'}
                  </Text>
                </TouchableOpacity>
                {filterCategoryId || filterProductId || filterVariantOption ? (
                  <TouchableOpacity
                    onPress={() => {
                      setFilterCategoryId(null);
                      setFilterProductId(null);
                      setFilterVariantOption(null);
                      setCountCategoryId(null);
                    }}
                  >
                    <Text style={styles.clearFilterText}>Reset</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <View style={styles.dropdownRow}>
              {/* 1. Category Dropdown */}
              <TouchableOpacity
                style={[
                  styles.dropdownSelector,
                  filterCategoryId ? styles.dropdownSelectorActive : null,
                ]}
                onPress={() => setOpenDropdown('category')}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.dropdownLabel}>1. Category</Text>
                  <Text style={styles.dropdownValue} numberOfLines={1}>
                    {selectedCategoryName}
                  </Text>
                </View>
                <Feather
                  name="chevron-down"
                  size={15}
                  color={palette.slate600}
                />
              </TouchableOpacity>

              {/* 2. Product / Name Dropdown */}
              <TouchableOpacity
                style={[
                  styles.dropdownSelector,
                  filterProductId ? styles.dropdownSelectorActive : null,
                ]}
                onPress={() => setOpenDropdown('product')}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.dropdownLabel}>2. Product / Name</Text>
                  <Text style={styles.dropdownValue} numberOfLines={1}>
                    {selectedProductName}
                  </Text>
                </View>
                <Feather
                  name="chevron-down"
                  size={15}
                  color={palette.slate600}
                />
              </TouchableOpacity>

              {/* 3. Size / Type Dropdown */}
              {availableVariantOptions.length > 0 ? (
                <TouchableOpacity
                  style={[
                    styles.dropdownSelector,
                    filterVariantOption ? styles.dropdownSelectorActive : null,
                  ]}
                  onPress={() => setOpenDropdown('variant')}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dropdownLabel}>3. Size / Type</Text>
                    <Text style={styles.dropdownValue} numberOfLines={1}>
                      {filterVariantOption || 'All Sizes / Types'}
                    </Text>
                  </View>
                  <Feather
                    name="chevron-down"
                    size={15}
                    color={palette.slate600}
                  />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Quick Size / Type Pills in exact input sequence (S, M, L, XL, XXL / 30..40 / Elastic, Zip) */}
            {availableVariantOptions.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: spacing.sm }}
                contentContainerStyle={{ gap: 6 }}
              >
                <TouchableOpacity
                  onPress={() => {
                    setFilterVariantOption(null);
                    selectFirstMatchingItem(filterCategoryId, filterProductId, null);
                  }}
                  style={[
                    styles.sizePill,
                    !filterVariantOption && styles.sizePillActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.sizePillText,
                      !filterVariantOption && styles.sizePillTextActive,
                    ]}
                  >
                    All Sizes / Types
                  </Text>
                </TouchableOpacity>
                {availableVariantOptions.map((opt) => {
                  const active = filterVariantOption === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => {
                        const nextOpt = active ? null : opt;
                        setFilterVariantOption(nextOpt);
                        selectFirstMatchingItem(
                          filterCategoryId,
                          filterProductId,
                          nextOpt
                        );
                      }}
                      style={[styles.sizePill, active && styles.sizePillActive]}
                    >
                      <Text
                        style={[
                          styles.sizePillText,
                          active && styles.sizePillTextActive,
                        ]}
                      >
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}
          </SectionCard>
        ) : null}

        {/* ================================================================
            WORKFLOW A: STOCK INWARD
           ================================================================ */}
        {activeTab === 'inward' && inventoryItems.length > 0 ? (
          <SectionCard>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.cardTitle}>Record Incoming Stock</Text>
                <Text style={styles.cardSubtitle}>
                  Increases recorded balance atomically and updates daily snapshots
                </Text>
              </View>
              <TouchableOpacity
                style={styles.scanChip}
                onPress={() => router.push('/scanner')}
              >
                <Feather name="maximize" size={14} color={palette.primary600} />
                <Text style={styles.scanChipText}>Scan</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>
              Matching Products / Sizes ({filteredInwardPickerItems.length}) *
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Search by product name, SKU, or barcode..."
              value={inwardSearch}
              onChangeText={setInwardSearch}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: spacing.xs }}
              contentContainerStyle={{ gap: spacing.xs }}
            >
              {filteredInwardPickerItems.map((item) => {
                const selected = item.itemKey === inwardItemKey;
                return (
                  <TouchableOpacity
                    key={item.itemKey}
                    onPress={() => setInwardItemKey(item.itemKey)}
                    style={[
                      styles.pickerPill,
                      selected && styles.pickerPillSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.pickerPillText,
                        selected && styles.pickerPillTextSelected,
                      ]}
                    >
                      {item.displayName} (
                      {formatQuantity(item.recordedQuantity, item.unitSymbol)})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {selectedInwardItem ? (
              <View style={styles.previewBox}>
                <View style={styles.rowBetween}>
                  <Text style={styles.previewTitle}>
                    {selectedInwardItem.displayName}
                  </Text>
                  <StockStatusBadge
                    status={selectedInwardItem.stockStatus}
                    size="sm"
                  />
                </View>
                <Text style={styles.previewSub}>
                  Current Recorded Balance:{' '}
                  <Text style={styles.bold}>
                    {formatQuantity(
                      selectedInwardItem.recordedQuantity,
                      selectedInwardItem.unitSymbol
                    )}
                  </Text>{' '}
                  • New Balance Preview:{' '}
                  <Text style={[styles.bold, { color: palette.primary600 }]}>
                    {formatQuantity(
                      addQuantities(
                        selectedInwardItem.recordedQuantity ?? 0,
                        Number(inwardQty) > 0 ? Number(inwardQty) : 0
                      ),
                      selectedInwardItem.unitSymbol
                    )}
                  </Text>
                </Text>
              </View>
            ) : null}

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>
                  Quantity Received (
                  {selectedInwardItem?.unitSymbol || 'units'}) *
                </Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  placeholder="e.g., 50"
                  value={inwardQty}
                  onChangeText={setInwardQty}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Receipt Date (YYYY-MM-DD) *</Text>
                <TextInput
                  style={styles.input}
                  value={inwardDate}
                  onChangeText={setInwardDate}
                />
              </View>
            </View>

            {suppliers.length > 0 ? (
              <>
                <Text style={styles.label}>Supplier (Optional)</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: spacing.xs }}
                >
                  <TouchableOpacity
                    onPress={() => setInwardSupplierId(null)}
                    style={[
                      styles.pickerPill,
                      inwardSupplierId === null && styles.pickerPillSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.pickerPillText,
                        inwardSupplierId === null &&
                          styles.pickerPillTextSelected,
                      ]}
                    >
                      No Supplier
                    </Text>
                  </TouchableOpacity>
                  {suppliers.map((s) => {
                    const selected = inwardSupplierId === s.id;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        onPress={() => setInwardSupplierId(s.id)}
                        style={[
                          styles.pickerPill,
                          selected && styles.pickerPillSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.pickerPillText,
                            selected && styles.pickerPillTextSelected,
                          ]}
                        >
                          {s.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}

            <Text style={styles.label}>
              Invoice / Reference Number (Optional)
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., INV-2026-104"
              value={inwardRef}
              onChangeText={setInwardRef}
            />

            <Text style={styles.label}>Notes (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Batch details, delivery remarks..."
              value={inwardNotes}
              onChangeText={setInwardNotes}
            />

            <PrimaryButton
              title="Save Stock Inward Transaction"
              icon="arrow-down-circle"
              loading={submittingInward}
              onPress={handleInwardSubmit}
              style={{ marginTop: spacing.lg }}
            />
          </SectionCard>
        ) : null}

        {/* ================================================================
            WORKFLOW B: DAILY PHYSICAL STOCK COUNT
           ================================================================ */}
        {activeTab === 'count' && inventoryItems.length > 0 ? (
          <SectionCard>
            <Text style={styles.cardTitle}>
              Daily Physical Stock Count Sheet
            </Text>
            <Text style={styles.cardSubtitle}>
              Establishes actual observed shelf quantities. Differences from previous inward-only balances are recorded as Physical Count Reconciliations — never as sales.
            </Text>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Count Date (YYYY-MM-DD) *</Text>
                <TextInput
                  style={styles.input}
                  value={countDate}
                  onChangeText={setCountDate}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Session Note (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Evening shelf count"
                  value={countSessionNotes}
                  onChangeText={setCountSessionNotes}
                />
              </View>
            </View>

            <Text style={styles.label}>Filter Items</Text>
            <TextInput
              style={styles.input}
              placeholder="Search product or SKU..."
              value={countSearch}
              onChangeText={setCountSearch}
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginVertical: spacing.sm }}
              contentContainerStyle={{ gap: spacing.xs }}
            >
              <TouchableOpacity
                onPress={() => setCountCategoryId(null)}
                style={[
                  styles.pickerPill,
                  !countCategoryId && styles.pickerPillSelected,
                ]}
              >
                <Text
                  style={[
                    styles.pickerPillText,
                    !countCategoryId && styles.pickerPillTextSelected,
                  ]}
                >
                  All Categories
                </Text>
              </TouchableOpacity>
              {categories.map((c) => {
                const selected = countCategoryId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() =>
                      setCountCategoryId(selected ? null : c.id)
                    }
                    style={[
                      styles.pickerPill,
                      selected && styles.pickerPillSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.pickerPillText,
                        selected && styles.pickerPillTextSelected,
                      ]}
                    >
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
              {filteredCountItems.map((item) => {
                const enteredStr = countInputs[item.itemKey] ?? '';
                const hasEntered = enteredStr.trim() !== '';
                const parsedNum = hasEntered ? Number(enteredStr) : null;
                const variance =
                  parsedNum !== null &&
                  !Number.isNaN(parsedNum) &&
                  item.recordedQuantity !== null
                    ? subtractQuantities(parsedNum, item.recordedQuantity)
                    : null;

                return (
                  <View key={item.itemKey} style={styles.countItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{item.displayName}</Text>
                      <Text style={styles.itemSub}>
                        Prev Recorded:{' '}
                        <Text style={styles.bold}>
                          {formatQuantity(
                            item.recordedQuantity,
                            item.unitSymbol
                          )}
                        </Text>{' '}
                        • Min:{' '}
                        {formatQuantity(
                          item.minStockThreshold,
                          item.unitSymbol
                        )}
                      </Text>
                      {variance !== null ? (
                        <Text
                          style={[
                            styles.varianceBadge,
                            {
                              color:
                                variance < 0
                                  ? palette.warning700
                                  : variance > 0
                                  ? palette.success700
                                  : palette.slate600,
                            },
                          ]}
                        >
                          Count Difference:{' '}
                          {variance > 0 ? `+${variance}` : variance}{' '}
                          {item.unitSymbol} (Physical Count Reconciliation)
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ width: 110 }}>
                      <TextInput
                        style={styles.countInput}
                        keyboardType="decimal-pad"
                        placeholder={`Count (${item.unitSymbol})`}
                        value={enteredStr}
                        onChangeText={(val) =>
                          setCountInputs((prev) => ({
                            ...prev,
                            [item.itemKey]: val,
                          }))
                        }
                      />
                    </View>
                  </View>
                );
              })}
            </View>

            <PrimaryButton
              title="Commit Physical Stock Count Session"
              icon="check-square"
              loading={submittingCount}
              onPress={handleBatchPhysicalCountSubmit}
              style={{ marginTop: spacing.lg }}
            />
          </SectionCard>
        ) : null}

        {/* ================================================================
            WORKFLOW D: CONTROLLED STOCK ADJUSTMENT
           ================================================================ */}
        {activeTab === 'adjustment' && inventoryItems.length > 0 ? (
          <SectionCard>
            <Text style={styles.cardTitle}>Controlled Stock Adjustment</Text>
            <Text style={styles.cardSubtitle}>
              Explicitly audited quantity corrections with mandatory reason codes
            </Text>

            <Text style={styles.label}>
              Select Product / Variant ({filteredInwardPickerItems.length}) *
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.xs }}
            >
              {filteredInwardPickerItems.map((item) => {
                const selected = item.itemKey === adjItemKey;
                return (
                  <TouchableOpacity
                    key={item.itemKey}
                    onPress={() => setAdjItemKey(item.itemKey)}
                    style={[
                      styles.pickerPill,
                      selected && styles.pickerPillSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.pickerPillText,
                        selected && styles.pickerPillTextSelected,
                      ]}
                    >
                      {item.displayName} (
                      {formatQuantity(item.recordedQuantity, item.unitSymbol)})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>
                  Quantity Difference (+ or -) *
                </Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numbers-and-punctuation"
                  placeholder="e.g., -3 or 5"
                  value={adjDelta}
                  onChangeText={setAdjDelta}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Adjustment Date *</Text>
                <TextInput
                  style={styles.input}
                  value={adjDate}
                  onChangeText={setAdjDate}
                />
              </View>
            </View>

            <Text style={styles.label}>Mandatory Adjustment Reason *</Text>
            <View style={styles.chipWrap}>
              {STOCK_ADJUSTMENT_REASONS.map((r) => {
                const selected = adjReason === r;
                return (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setAdjReason(r)}
                    style={[
                      styles.pickerPill,
                      selected && styles.pickerPillSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.pickerPillText,
                        selected && styles.pickerPillTextSelected,
                      ]}
                    >
                      {r}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>Audit Notes (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Explanation for audit log..."
              value={adjNotes}
              onChangeText={setAdjNotes}
            />

            <PrimaryButton
              title="Record Audited Stock Adjustment"
              icon="sliders"
              loading={submittingAdj}
              onPress={handleAdjustmentSubmit}
              style={{ marginTop: spacing.lg }}
            />
          </SectionCard>
        ) : null}

        {/* ================================================================
            WORKFLOW E: IMMUTABLE STOCK EVENT LEDGER
           ================================================================ */}
        {activeTab === 'ledger' ? (
          <SectionCard>
            <Text style={styles.cardTitle}>
              Immutable Stock Event Ledger ({recentEvents.length})
            </Text>
            <Text style={styles.cardSubtitle}>
              Complete chronological audit trail of OPENING_STOCK, STOCK_INWARD, PHYSICAL_COUNT, and STOCK_ADJUSTMENT events
            </Text>

            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {recentEvents.map((ev) => (
                <View key={ev.id} style={styles.countItemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{ev.displayName}</Text>
                    <Text style={styles.itemSub}>
                      {ev.eventType} •{' '}
                      {formatDisplayDate(ev.eventDate, profile?.dateFormat)} •
                      SKU: {ev.sku}
                    </Text>
                    {ev.varianceQuantity !== null ? (
                      <Text style={styles.varianceBadge}>
                        Physical Count Reconciliation Variance:{' '}
                        {ev.varianceQuantity > 0
                          ? `+${ev.varianceQuantity}`
                          : ev.varianceQuantity}{' '}
                        {ev.unitSymbol}
                      </Text>
                    ) : null}
                    {ev.supplierName || ev.referenceNumber || ev.reason ? (
                      <Text style={styles.itemSub}>
                        {[ev.supplierName, ev.referenceNumber, ev.reason]
                          .filter(Boolean)
                          .join(' • ')}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.bold}>
                      {ev.eventType === 'STOCK_INWARD'
                        ? `+${formatQuantity(ev.quantity, ev.unitSymbol)}`
                        : ev.eventType === 'PHYSICAL_COUNT'
                        ? `Count: ${formatQuantity(ev.quantity, ev.unitSymbol)}`
                        : formatQuantity(ev.quantity, ev.unitSymbol)}
                    </Text>
                    <Text style={styles.itemSub}>
                      Bal: {formatQuantity(ev.resultingBalance, ev.unitSymbol)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </SectionCard>
        ) : null}
      </ScrollView>

      {/* =====================================================================
          QUICK FILTER DROPDOWN PICKER MODAL (Category -> Product -> Size/Type)
         ===================================================================== */}
      <Modal
        visible={openDropdown !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenDropdown(null)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setOpenDropdown(null)}
          style={styles.modalBackdrop}
        >
          <View style={styles.dropdownModalCard}>
            <Text style={styles.modalTitle}>
              {openDropdown === 'category'
                ? 'Select Category'
                : openDropdown === 'product'
                ? 'Select Product / Saree / Style'
                : 'Select Size / Variant Type'}
            </Text>

            <ScrollView style={{ maxHeight: 340 }}>
              {openDropdown === 'category' ? (
                <>
                  <TouchableOpacity
                    style={[
                      styles.dropdownOptionRow,
                      !filterCategoryId && styles.dropdownOptionRowActive,
                    ]}
                    onPress={() => {
                      setFilterCategoryId(null);
                      setFilterProductId(null);
                      setFilterVariantOption(null);
                      setCountCategoryId(null);
                      selectFirstMatchingItem(null, null, null);
                      setOpenDropdown(null);
                    }}
                  >
                    <Text style={styles.dropdownOptionText}>
                      All Categories ({inventoryItems.length} SKUs)
                    </Text>
                    {!filterCategoryId ? (
                      <Feather
                        name="check"
                        size={16}
                        color={palette.primary600}
                      />
                    ) : null}
                  </TouchableOpacity>
                  {categories.map((cat) => {
                    const active = filterCategoryId === cat.id;
                    const count = inventoryItems.filter(
                      (i) => i.categoryId === cat.id
                    ).length;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.dropdownOptionRow,
                          active && styles.dropdownOptionRowActive,
                        ]}
                        onPress={() => {
                          setFilterCategoryId(cat.id);
                          setFilterProductId(null);
                          setFilterVariantOption(null);
                          setCountCategoryId(cat.id);
                          selectFirstMatchingItem(cat.id, null, null);
                          setOpenDropdown(null);
                        }}
                      >
                        <Text style={styles.dropdownOptionText}>
                          {cat.name} ({count})
                        </Text>
                        {active ? (
                          <Feather
                            name="check"
                            size={16}
                            color={palette.primary600}
                          />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </>
              ) : null}

              {openDropdown === 'product' ? (
                <>
                  <TouchableOpacity
                    style={[
                      styles.dropdownOptionRow,
                      !filterProductId && styles.dropdownOptionRowActive,
                    ]}
                    onPress={() => {
                      setFilterProductId(null);
                      setFilterVariantOption(null);
                      selectFirstMatchingItem(filterCategoryId, null, null);
                      setOpenDropdown(null);
                    }}
                  >
                    <Text style={styles.dropdownOptionText}>
                      All Items / Styles
                    </Text>
                    {!filterProductId ? (
                      <Feather
                        name="check"
                        size={16}
                        color={palette.primary600}
                      />
                    ) : null}
                  </TouchableOpacity>
                  {availableProducts.map((prod) => {
                    const active = filterProductId === prod.productId;
                    return (
                      <TouchableOpacity
                        key={prod.productId}
                        style={[
                          styles.dropdownOptionRow,
                          active && styles.dropdownOptionRowActive,
                        ]}
                        onPress={() => {
                          setFilterProductId(prod.productId);
                          setFilterVariantOption(null);
                          selectFirstMatchingItem(
                            filterCategoryId,
                            prod.productId,
                            null
                          );
                          setOpenDropdown(null);
                        }}
                      >
                        <Text style={styles.dropdownOptionText}>
                          {prod.productName}
                        </Text>
                        {active ? (
                          <Feather
                            name="check"
                            size={16}
                            color={palette.primary600}
                          />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </>
              ) : null}

              {openDropdown === 'variant' ? (
                <>
                  <TouchableOpacity
                    style={[
                      styles.dropdownOptionRow,
                      !filterVariantOption && styles.dropdownOptionRowActive,
                    ]}
                    onPress={() => {
                      setFilterVariantOption(null);
                      selectFirstMatchingItem(
                        filterCategoryId,
                        filterProductId,
                        null
                      );
                      setOpenDropdown(null);
                    }}
                  >
                    <Text style={styles.dropdownOptionText}>
                      All Sizes / Types
                    </Text>
                    {!filterVariantOption ? (
                      <Feather
                        name="check"
                        size={16}
                        color={palette.primary600}
                      />
                    ) : null}
                  </TouchableOpacity>
                  {availableVariantOptions.map((opt) => {
                    const active = filterVariantOption === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[
                          styles.dropdownOptionRow,
                          active && styles.dropdownOptionRowActive,
                        ]}
                        onPress={() => {
                          setFilterVariantOption(opt);
                          selectFirstMatchingItem(
                            filterCategoryId,
                            filterProductId,
                            opt
                          );
                          setOpenDropdown(null);
                        }}
                      >
                        <Text style={styles.dropdownOptionText}>{opt}</Text>
                        {active ? (
                          <Feather
                            name="check"
                            size={16}
                            color={palette.primary600}
                          />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </>
              ) : null}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function getStyles() {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: palette.slate50,
    },
    quickFilterCard: {
      marginBottom: spacing.md,
      padding: spacing.md,
    },
    quickFilterHeader: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.slate700,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    clearFilterText: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.primary600,
    },
    sortToggleChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: radius.pill,
      backgroundColor: palette.primary50,
      borderWidth: 1,
      borderColor: palette.primary100,
    },
    sortToggleText: {
      fontSize: 11,
      fontWeight: '700',
      color: palette.primary600,
    },
    dropdownRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    dropdownSelector: {
      flex: 1,
      minWidth: 130,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: palette.slate300,
      backgroundColor: palette.slate50,
    },
    dropdownSelectorActive: {
      borderColor: palette.primary600,
      backgroundColor: palette.primary50,
    },
    dropdownLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: palette.slate500,
      textTransform: 'uppercase',
    },
    dropdownValue: {
      fontSize: 13,
      fontWeight: '700',
      color: palette.slate900,
      marginTop: 2,
    },
    sizePill: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: palette.slate300,
      backgroundColor: palette.white,
    },
    sizePillActive: {
      backgroundColor: palette.primary600,
      borderColor: palette.primary600,
    },
    sizePillText: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.slate700,
    },
    sizePillTextActive: {
      color: '#FFFFFF',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.55)',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    dropdownModalCard: {
      backgroundColor: palette.white,
      borderRadius: radius.lg,
      padding: spacing.lg,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: palette.slate900,
      marginBottom: spacing.sm,
    },
    dropdownOptionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderBottomWidth: 1,
      borderBottomColor: palette.slate100,
    },
    dropdownOptionRowActive: {
      backgroundColor: palette.primary50,
    },
    dropdownOptionText: {
      fontSize: 14,
      fontWeight: '600',
      color: palette.slate900,
    },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: palette.white,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.slate200,
    gap: 6,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: palette.slate100,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: palette.primary600,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.slate700,
  },
  tabTextActive: {
    color: palette.white,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  feedbackSuccess: {
    backgroundColor: palette.success50,
    borderColor: palette.success100,
  },
  feedbackError: {
    backgroundColor: palette.danger50,
    borderColor: palette.danger100,
  },
  feedbackText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.slate900,
  },
  cardSubtitle: {
    fontSize: 12,
    color: palette.slate500,
    marginTop: 2,
  },
  scanChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.primary50,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.primary100,
  },
  scanChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.primary600,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.slate700,
    marginTop: spacing.md,
    marginBottom: 4,
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
  pickerPill: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.slate300,
    backgroundColor: palette.white,
  },
  pickerPillSelected: {
    backgroundColor: palette.navy900,
    borderColor: palette.navy900,
  },
  pickerPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.slate700,
  },
  pickerPillTextSelected: {
    color: palette.white,
  },
  previewBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.primary50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.primary100,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.slate900,
  },
  previewSub: {
    fontSize: 12,
    color: palette.slate700,
    marginTop: 4,
  },
  bold: {
    fontWeight: '700',
    color: palette.slate900,
  },
  countItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: palette.slate50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.slate200,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.slate900,
  },
  itemSub: {
    fontSize: 12,
    color: palette.slate500,
    marginTop: 2,
  },
  varianceBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.indigo700,
    marginTop: 3,
  },
  countInput: {
    borderWidth: 1,
    borderColor: palette.primary500,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
    backgroundColor: palette.white,
    color: palette.slate900,
  },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
  });
}
