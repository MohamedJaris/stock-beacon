import {
  EmptyStateView,
  PrimaryButton,
  SectionCard,
} from '@/components/common/AppComponents';
import { StockStatusBadge } from '@/components/inventory/StatusBadge';
import { formatDisplayDate, getTodayInTimezone } from '@/core/utils/dateUtils';
import {
  addQuantities,
  formatQuantity,
  subtractQuantities,
} from '@/core/utils/quantityMath';
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

type StockTab = 'inward' | 'count' | 'ledger';
type ActiveDropdown = 'category' | 'product' | 'variant' | null;

export default function StockOperationsScreen() {
  const styles = getStyles();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string; itemKey?: string }>();

  const profile = useAppStore((s) => s.profile);
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const inventoryItems = useAppStore((s) => s.inventoryItems);
  const categories = useAppStore((s) => s.categories);
  const recentEvents = useAppStore((s) => s.recentEvents);
  const recordStockInward = useAppStore((s) => s.recordStockInward);
  const recordBatchPhysicalCount = useAppStore(
    (s) => s.recordBatchPhysicalCount
  );

  const today = getTodayInTimezone(profile?.timezone || 'Asia/Kolkata');

  const initialTab: StockTab =
    params.tab === 'count'
      ? 'count'
      : params.tab === 'ledger'
      ? 'ledger'
      : 'inward';

  const [activeTab, setActiveTab] = useState<StockTab>(initialTab);
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
  const [dropdownSearch, setDropdownSearch] = useState('');

  // --- Stock Inward State ---
  const [inwardItemKey, setInwardItemKey] = useState<string>(
    params.itemKey || inventoryItems[0]?.itemKey || ''
  );
  const [inwardQty, setInwardQty] = useState('');
  const [inwardDate, setInwardDate] = useState(today);
  const [inwardRef, setInwardRef] = useState('');
  const [inwardNotes, setInwardNotes] = useState('');
  const [showInwardOptional, setShowInwardOptional] = useState(false);
  const [submittingInward, setSubmittingInward] = useState(false);

  // --- Physical Stock Count State ---
  const [countDate, setCountDate] = useState(today);
  const [countInputs, setCountInputs] = useState<Record<string, string>>({});
  const [submittingCount, setSubmittingCount] = useState(false);

  useEffect(() => {
    if (params.tab === 'count' || params.tab === 'ledger' || params.tab === 'inward') {
      setActiveTab(params.tab);
    }
    if (params.itemKey) {
      setInwardItemKey(params.itemKey);
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
      const first = inventoryItems[0];
      setInwardItemKey(first.itemKey);
      setFilterCategoryId(first.categoryId);
      setFilterProductId(first.productId);
      setFilterVariantOption(first.variantName);
    }
  }, [inventoryItems, inwardItemKey]);

  // Distinct products for the Product Dropdown
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

  // Distinct sizes / variant names in EXACT input order
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

  const selectedInwardItem = inventoryItems.find(
    (i) => i.itemKey === inwardItemKey
  );

  const selectedCategoryName =
    categories.find((c) => c.id === filterCategoryId)?.name ||
    selectedInwardItem?.categoryName ||
    'All';
  const selectedProductName =
    availableProducts.find((p) => p.productId === filterProductId)
      ?.productName ||
    selectedInwardItem?.productName ||
    'Select Product';

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
      const picked = matching[0];
      setInwardItemKey(picked.itemKey);
      if (!prodId) {
        setFilterProductId(picked.productId);
      }
      if (!variantOpt && picked.variantName) {
        setFilterVariantOption(picked.variantName);
      }
    }
  };

  const filteredCountItems = useMemo(() => {
    const list = inventoryItems.filter((i) => {
      if (filterCategoryId && i.categoryId !== filterCategoryId) return false;
      if (filterProductId && i.productId !== filterProductId) return false;
      if (filterVariantOption && i.variantName !== filterVariantOption) {
        return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (a.productId === b.productId) {
        return (a.variantSortOrder ?? 0) - (b.variantSortOrder ?? 0);
      }
      return 0;
    });

    return list;
  }, [inventoryItems, filterCategoryId, filterProductId, filterVariantOption]);

  const handleInwardSubmit = async () => {
    setFeedback(null);
    if (!selectedInwardItem) {
      setFeedback({
        type: 'error',
        message: 'Please select a product.',
      });
      return;
    }
    const qty = Number(inwardQty);
    if (!qty || Number.isNaN(qty) || qty <= 0) {
      setFeedback({
        type: 'error',
        message: 'Enter a valid quantity greater than zero.',
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
        supplierId: null,
        referenceNumber: inwardRef.trim() || null,
        notes: inwardNotes.trim() || null,
      });
      setInwardQty('');
      setInwardRef('');
      setInwardNotes('');
      setFeedback({
        type: 'success',
        message: `Added +${formatQuantity(
          qty,
          selectedInwardItem.unitSymbol
        )} to ${selectedInwardItem.displayName}.`,
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
          message: 'Quantities must be 0 or greater.',
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
        message: 'Enter at least one counted quantity before saving.',
      });
      return;
    }

    setSubmittingCount(true);
    try {
      await recordBatchPhysicalCount({
        eventDate: countDate,
        sessionNotes: null,
        entries,
      });
      setCountInputs({});
      setFeedback({
        type: 'success',
        message: `Updated physical stock count for ${entries.length} item(s).`,
      });
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setSubmittingCount(false);
    }
  };

  const filteredProductsForModal = useMemo(() => {
    const q = dropdownSearch.trim().toLowerCase();
    if (!q) return availableProducts;
    return availableProducts.filter((p) =>
      p.productName.toLowerCase().includes(q)
    );
  }, [availableProducts, dropdownSearch]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Clean 3-Tab Bar */}
      <View style={styles.tabBar}>
        {(
          [
            { key: 'inward', label: 'Add Stock' },
            { key: 'count', label: 'Update Count' },
            { key: 'ledger', label: 'History' },
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
            title="No Products Yet"
            message="Add your first product before recording stock."
            actionTitle="Add Product"
            onActionPress={() => router.push('/product/new')}
          />
        ) : null}

        {/* ================================================================
            CLEAN FILTER BAR (Category -> Product -> Size / Type)
           ================================================================ */}
        {activeTab !== 'ledger' && inventoryItems.length > 0 ? (
          <View style={styles.filterBox}>
            <View style={styles.dropdownRow}>
              {/* 1. Category */}
              <TouchableOpacity
                style={[
                  styles.dropdownSelector,
                  filterCategoryId ? styles.dropdownSelectorActive : null,
                ]}
                onPress={() => setOpenDropdown('category')}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.dropdownLabel}>Category</Text>
                  <Text style={styles.dropdownValue} numberOfLines={1}>
                    {selectedCategoryName}
                  </Text>
                </View>
                <Feather
                  name="chevron-down"
                  size={14}
                  color={palette.slate500}
                />
              </TouchableOpacity>

              {/* 2. Product */}
              <TouchableOpacity
                style={[
                  styles.dropdownSelector,
                  filterProductId ? styles.dropdownSelectorActive : null,
                ]}
                onPress={() => {
                  setDropdownSearch('');
                  setOpenDropdown('product');
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.dropdownLabel}>Product</Text>
                  <Text style={styles.dropdownValue} numberOfLines={1}>
                    {selectedProductName}
                  </Text>
                </View>
                <Feather
                  name="chevron-down"
                  size={14}
                  color={palette.slate500}
                />
              </TouchableOpacity>

              {/* 3. Size / Type */}
              {availableVariantOptions.length > 0 ? (
                <TouchableOpacity
                  style={[
                    styles.dropdownSelector,
                    filterVariantOption ? styles.dropdownSelectorActive : null,
                  ]}
                  onPress={() => setOpenDropdown('variant')}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dropdownLabel}>Size / Type</Text>
                    <Text style={styles.dropdownValue} numberOfLines={1}>
                      {filterVariantOption ||
                        selectedInwardItem?.variantName ||
                        'All'}
                    </Text>
                  </View>
                  <Feather
                    name="chevron-down"
                    size={14}
                    color={palette.slate500}
                  />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* One-Tap Size / Type Pills in Exact Input Order */}
            {availableVariantOptions.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: 8 }}
                contentContainerStyle={{ gap: 6 }}
              >
                {activeTab === 'count' ? (
                  <TouchableOpacity
                    onPress={() => setFilterVariantOption(null)}
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
                      All Sizes
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {availableVariantOptions.map((opt) => {
                  const active =
                    activeTab === 'inward'
                      ? selectedInwardItem?.variantName === opt
                      : filterVariantOption === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => {
                        setFilterVariantOption(opt);
                        selectFirstMatchingItem(
                          filterCategoryId,
                          filterProductId,
                          opt
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
          </View>
        ) : null}

        {/* ================================================================
            TAB 1: ADD STOCK INWARD
           ================================================================ */}
        {activeTab === 'inward' && inventoryItems.length > 0 ? (
          <SectionCard>
            {selectedInwardItem ? (
              <View style={styles.previewBox}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.previewTitle}>
                      {selectedInwardItem.displayName}
                    </Text>
                    <Text style={styles.previewMeta}>
                      {selectedInwardItem.categoryName}
                    </Text>
                  </View>
                  <StockStatusBadge
                    status={selectedInwardItem.stockStatus}
                    size="sm"
                  />
                </View>

                <View style={styles.balancePreviewRow}>
                  <View>
                    <Text style={styles.balanceLabel}>Current Stock</Text>
                    <Text style={styles.balanceVal}>
                      {formatQuantity(
                        selectedInwardItem.recordedQuantity,
                        selectedInwardItem.unitSymbol
                      )}
                    </Text>
                  </View>
                  <Feather
                    name="arrow-right"
                    size={16}
                    color={palette.slate400}
                  />
                  <View>
                    <Text style={styles.balanceLabel}>After Adding</Text>
                    <Text
                      style={[styles.balanceVal, { color: palette.primary600 }]}
                    >
                      {formatQuantity(
                        addQuantities(
                          selectedInwardItem.recordedQuantity ?? 0,
                          Number(inwardQty) > 0 ? Number(inwardQty) : 0
                        ),
                        selectedInwardItem.unitSymbol
                      )}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}

            <Text style={styles.label}>
              Quantity Received ({selectedInwardItem?.unitSymbol || 'pcs'}) *
            </Text>
            <TextInput
              style={styles.qtyLargeInput}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={palette.slate400}
              value={inwardQty}
              onChangeText={setInwardQty}
            />

            <TouchableOpacity
              style={styles.optionalToggle}
              onPress={() => setShowInwardOptional((v) => !v)}
            >
              <Feather
                name={showInwardOptional ? 'chevron-up' : 'chevron-down'}
                size={15}
                color={palette.primary600}
              />
              <Text style={styles.optionalToggleText}>
                {showInwardOptional
                  ? 'Hide Optional Details'
                  : 'Add Date, Bill No, or Note (Optional)'}
              </Text>
            </TouchableOpacity>

            {showInwardOptional ? (
              <View style={{ marginTop: spacing.xs }}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
                    <TextInput
                      style={styles.input}
                      value={inwardDate}
                      onChangeText={setInwardDate}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Bill / Invoice No</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Optional"
                      placeholderTextColor={palette.slate400}
                      value={inwardRef}
                      onChangeText={setInwardRef}
                    />
                  </View>
                </View>

                <Text style={styles.label}>Note</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Optional delivery note..."
                  placeholderTextColor={palette.slate400}
                  value={inwardNotes}
                  onChangeText={setInwardNotes}
                />
              </View>
            ) : null}

            <PrimaryButton
              title="Save Stock Inward"
              icon="check"
              loading={submittingInward}
              onPress={handleInwardSubmit}
              style={{ marginTop: spacing.lg }}
            />
          </SectionCard>
        ) : null}

        {/* ================================================================
            TAB 2: UPDATE / PHYSICAL COUNT
           ================================================================ */}
        {activeTab === 'count' && inventoryItems.length > 0 ? (
          <SectionCard>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Update Actual Shelf Stock</Text>
                <Text style={styles.cardSubtitle}>
                  Type the current shelf count for any item below and save.
                </Text>
              </View>
              {(filterCategoryId || filterProductId || filterVariantOption) ? (
                <TouchableOpacity
                  onPress={() => {
                    setFilterCategoryId(null);
                    setFilterProductId(null);
                    setFilterVariantOption(null);
                  }}
                >
                  <Text style={styles.clearFilterText}>Show All</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={{ gap: 8, marginTop: spacing.md }}>
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
                        Current:{' '}
                        <Text style={styles.bold}>
                          {formatQuantity(
                            item.recordedQuantity,
                            item.unitSymbol
                          )}
                        </Text>
                        {variance !== null && variance !== 0 ? (
                          <Text
                            style={{
                              color:
                                variance < 0
                                  ? palette.warning600
                                  : palette.success600,
                              fontWeight: '700',
                            }}
                          >
                            {' '}
                            ({variance > 0 ? `+${variance}` : variance})
                          </Text>
                        ) : null}
                      </Text>
                    </View>
                    <View style={{ width: 96 }}>
                      <TextInput
                        style={styles.countInput}
                        keyboardType="decimal-pad"
                        placeholder={String(item.recordedQuantity ?? 0)}
                        placeholderTextColor={palette.slate400}
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
              title="Save Updated Counts"
              icon="check-square"
              loading={submittingCount}
              onPress={handleBatchPhysicalCountSubmit}
              style={{ marginTop: spacing.lg }}
            />
          </SectionCard>
        ) : null}

        {/* ================================================================
            TAB 3: STOCK HISTORY
           ================================================================ */}
        {activeTab === 'ledger' ? (
          <SectionCard>
            <Text style={styles.cardTitle}>
              Recent Stock History ({recentEvents.length})
            </Text>

            {recentEvents.length === 0 ? (
              <EmptyStateView
                icon="clock"
                title="No Stock History"
                message="Your stock additions and count updates will be listed here."
              />
            ) : (
              <View style={{ gap: 8, marginTop: spacing.md }}>
                {recentEvents.map((ev) => (
                  <View key={ev.id} style={styles.countItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{ev.displayName}</Text>
                      <Text style={styles.itemSub}>
                        {ev.eventType === 'STOCK_INWARD'
                          ? 'Stock Inward'
                          : ev.eventType === 'PHYSICAL_COUNT'
                          ? 'Count Updated'
                          : ev.eventType === 'OPENING_STOCK'
                          ? 'Opening Stock'
                          : 'Adjusted'}{' '}
                        • {formatDisplayDate(ev.eventDate, profile?.dateFormat)}
                        {ev.referenceNumber ? ` • #${ev.referenceNumber}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text
                        style={[
                          styles.bold,
                          ev.eventType === 'STOCK_INWARD' && {
                            color: palette.success600,
                          },
                        ]}
                      >
                        {ev.eventType === 'STOCK_INWARD'
                          ? `+${formatQuantity(ev.quantity, ev.unitSymbol)}`
                          : formatQuantity(ev.quantity, ev.unitSymbol)}
                      </Text>
                      <Text style={styles.itemSub}>
                        Bal: {formatQuantity(ev.resultingBalance, ev.unitSymbol)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
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
                ? 'Select Product'
                : 'Select Size / Type'}
            </Text>

            {openDropdown === 'product' && availableProducts.length > 5 ? (
              <TextInput
                style={[styles.input, { marginBottom: spacing.sm }]}
                placeholder="Search product name..."
                placeholderTextColor={palette.slate400}
                value={dropdownSearch}
                onChangeText={setDropdownSearch}
              />
            ) : null}

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
                      selectFirstMatchingItem(null, null, null);
                      setOpenDropdown(null);
                    }}
                  >
                    <Text style={styles.dropdownOptionText}>
                      All Categories ({inventoryItems.length})
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
                  {activeTab === 'count' ? (
                    <TouchableOpacity
                      style={[
                        styles.dropdownOptionRow,
                        !filterProductId && styles.dropdownOptionRowActive,
                      ]}
                      onPress={() => {
                        setFilterProductId(null);
                        setFilterVariantOption(null);
                        setOpenDropdown(null);
                      }}
                    >
                      <Text style={styles.dropdownOptionText}>All Products</Text>
                      {!filterProductId ? (
                        <Feather
                          name="check"
                          size={16}
                          color={palette.primary600}
                        />
                      ) : null}
                    </TouchableOpacity>
                  ) : null}
                  {filteredProductsForModal.map((prod) => {
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
    tabBar: {
      flexDirection: 'row',
      backgroundColor: palette.white,
      paddingHorizontal: spacing.lg,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: palette.slate200,
      gap: 8,
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
      fontSize: 13,
      fontWeight: '700',
      color: palette.slate700,
    },
    tabTextActive: {
      color: '#FFFFFF',
    },
    scrollContent: {
      padding: spacing.md,
      paddingBottom: 40,
    },
    filterBox: {
      backgroundColor: palette.white,
      borderRadius: radius.md,
      padding: spacing.sm,
      borderWidth: 1,
      borderColor: palette.slate200,
      marginBottom: spacing.md,
    },
    dropdownRow: {
      flexDirection: 'row',
      gap: 6,
    },
    dropdownSelector: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: palette.slate200,
      backgroundColor: palette.slate50,
    },
    dropdownSelectorActive: {
      borderColor: palette.primary600,
      backgroundColor: palette.primary50,
    },
    dropdownLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: palette.slate500,
    },
    dropdownValue: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.slate900,
      marginTop: 1,
    },
    sizePill: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: palette.slate200,
      backgroundColor: palette.slate50,
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
      alignItems: 'center',
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
    clearFilterText: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.primary600,
    },
    previewBox: {
      padding: spacing.md,
      backgroundColor: palette.slate50,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: palette.slate200,
    },
    previewTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: palette.slate900,
    },
    previewMeta: {
      fontSize: 12,
      color: palette.slate500,
      marginTop: 2,
    },
    balancePreviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: palette.slate200,
    },
    balanceLabel: {
      fontSize: 11,
      color: palette.slate500,
      fontWeight: '600',
    },
    balanceVal: {
      fontSize: 16,
      fontWeight: '800',
      color: palette.slate900,
      marginTop: 2,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: palette.slate700,
      marginTop: spacing.md,
      marginBottom: 4,
    },
    qtyLargeInput: {
      borderWidth: 1.5,
      borderColor: palette.primary600,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      fontSize: 20,
      fontWeight: '800',
      color: palette.slate900,
      backgroundColor: palette.white,
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
    },
    optionalToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: spacing.md,
      paddingVertical: 4,
    },
    optionalToggleText: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.primary600,
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
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
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
    countInput: {
      borderWidth: 1,
      borderColor: palette.slate300,
      borderRadius: radius.md,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'right',
      backgroundColor: palette.white,
      color: palette.slate900,
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
  });
}
