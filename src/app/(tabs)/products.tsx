import {
  EmptyStateView,
  PrimaryButton,
  SectionCard,
} from '@/components/common/AppComponents';
import {
  ProvenanceBadge,
  StockStatusBadge,
} from '@/components/inventory/StatusBadge';
import { formatDisplayDate } from '@/core/utils/dateUtils';
import { formatQuantity } from '@/core/utils/quantityMath';
import { StockStatus } from '@/domain/enums';
import { useAppStore } from '@/stores/useAppStore';
import { palette, radius, spacing } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type SubTab = 'catalog' | 'categories' | 'units';
type SortOption = 'input_order' | 'name' | 'quantity_asc' | 'quantity_desc';

export default function ProductsScreen() {
  const styles = getStyles();
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const inventoryItems = useAppStore((s) => s.inventoryItems);
  const categories = useAppStore((s) => s.categories);
  const units = useAppStore((s) => s.units);
  const addCategory = useAppStore((s) => s.addCategory);
  const updateCategory = useAppStore((s) => s.updateCategory);
  const removeCategory = useAppStore((s) => s.removeCategory);
  const addUnit = useAppStore((s) => s.addUnit);

  const [activeSubTab, setActiveSubTab] = useState<SubTab>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null
  );
  const [selectedVariantOption, setSelectedVariantOption] = useState<
    string | null
  >(null);
  const [selectedStatus, setSelectedStatus] = useState<StockStatus | null>(
    null
  );
  // Default sort is 'input_order' so sizes like S, M, L, XL, XXL or 30, 32, 34, 36, 38, 40 stay in exact input order!
  const [sortBy, setSortBy] = useState<SortOption>('input_order');

  // Quick Filter Dropdown Modals
  const [openDropdown, setOpenDropdown] = useState<
    'category' | 'product' | 'variant' | null
  >(null);

  // Category modal state (Create & Edit)
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [newCatColor, setNewCatColor] = useState('#2563EB');
  const [catError, setCatError] = useState<string | null>(null);

  // Category remove / delete confirmation modal state
  const [removingCategory, setRemovingCategory] = useState<{
    id: string;
    name: string;
    skuCount: number;
  } | null>(null);
  const [reassignTargetCatId, setReassignTargetCatId] = useState<string | null>(
    null
  );

  // Unit modal state
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitSymbol, setNewUnitSymbol] = useState('');
  const [newUnitFractional, setNewUnitFractional] = useState(false);
  const [unitError, setUnitError] = useState<string | null>(null);

  // Distinct products for the Quick Product Dropdown (filtered by selected category if any)
  const availableProducts = useMemo(() => {
    const map = new Map<
      string,
      { productId: string; productName: string; categoryId: string }
    >();
    for (const item of inventoryItems) {
      if (selectedCategoryId && item.categoryId !== selectedCategoryId) {
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
  }, [inventoryItems, selectedCategoryId]);

  // Distinct sizes / variant names in EXACT input order (never alphabetically scrambled!)
  const availableVariantOptions = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];

    const sourceItems = [...inventoryItems]
      .filter((item) => {
        if (selectedCategoryId && item.categoryId !== selectedCategoryId) {
          return false;
        }
        if (selectedProductId && item.productId !== selectedProductId) {
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
  }, [inventoryItems, selectedCategoryId, selectedProductId]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = inventoryItems.filter((item) => {
      if (selectedCategoryId && item.categoryId !== selectedCategoryId) {
        return false;
      }
      if (selectedProductId && item.productId !== selectedProductId) {
        return false;
      }
      if (
        selectedVariantOption &&
        item.variantName !== selectedVariantOption
      ) {
        return false;
      }
      if (selectedStatus && item.stockStatus !== selectedStatus) {
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
      if (sortBy === 'quantity_asc') {
        return (
          (a.recordedQuantity ?? Number.POSITIVE_INFINITY) -
          (b.recordedQuantity ?? Number.POSITIVE_INFINITY)
        );
      }
      if (sortBy === 'quantity_desc') {
        return (
          (b.recordedQuantity ?? Number.NEGATIVE_INFINITY) -
          (a.recordedQuantity ?? Number.NEGATIVE_INFINITY)
        );
      }
      if (sortBy === 'name') {
        return a.displayName.localeCompare(b.displayName);
      }
      // Default: 'input_order' — keeps exact size/variant sequence (e.g., S, M, L, XL, XXL or 30, 32, 34, 36, 38, 40)
      if (a.productId === b.productId) {
        return (a.variantSortOrder ?? 0) - (b.variantSortOrder ?? 0);
      }
      return 0;
    });

    return list;
  }, [
    inventoryItems,
    searchQuery,
    selectedCategoryId,
    selectedProductId,
    selectedVariantOption,
    selectedStatus,
    sortBy,
  ]);

  const selectedCategoryName =
    categories.find((c) => c.id === selectedCategoryId)?.name ||
    'All Categories';
  const selectedProductName =
    availableProducts.find((p) => p.productId === selectedProductId)
      ?.productName || 'All Items / Styles';

  const openCreateCategoryModal = () => {
    setEditingCatId(null);
    setNewCatName('');
    setNewCatDesc('');
    setNewCatColor('#2563EB');
    setCatError(null);
    setShowCatModal(true);
  };

  const openEditCategoryModal = (cat: {
    id: string;
    name: string;
    description: string | null;
    colorHex: string;
  }) => {
    setEditingCatId(cat.id);
    setNewCatName(cat.name);
    setNewCatDesc(cat.description || '');
    setNewCatColor(cat.colorHex || '#2563EB');
    setCatError(null);
    setShowCatModal(true);
  };

  const handleSaveCategory = async () => {
    setCatError(null);
    if (!newCatName.trim()) {
      setCatError('Category name is required.');
      return;
    }
    try {
      if (editingCatId) {
        await updateCategory(editingCatId, {
          name: newCatName.trim(),
          description: newCatDesc.trim() || null,
          colorHex: newCatColor,
        });
      } else {
        await addCategory({
          name: newCatName.trim(),
          description: newCatDesc.trim() || undefined,
          colorHex: newCatColor,
        });
      }
      setEditingCatId(null);
      setNewCatName('');
      setNewCatDesc('');
      setShowCatModal(false);
    } catch (err) {
      setCatError((err as Error).message);
    }
  };

  const handleConfirmRemoveCategory = async () => {
    if (!removingCategory) return;
    try {
      await removeCategory({
        categoryId: removingCategory.id,
        reassignToCategoryId: reassignTargetCatId,
      });
      if (selectedCategoryId === removingCategory.id) {
        setSelectedCategoryId(null);
      }
      setRemovingCategory(null);
      setReassignTargetCatId(null);
    } catch (err) {
      setCatError((err as Error).message);
    }
  };

  const handleCreateUnit = async () => {
    setUnitError(null);
    if (!newUnitName.trim() || !newUnitSymbol.trim()) {
      setUnitError('Unit name and symbol are required.');
      return;
    }
    try {
      await addUnit({
        name: newUnitName.trim(),
        symbol: newUnitSymbol.trim(),
        allowFractional: newUnitFractional,
      });
      setNewUnitName('');
      setNewUnitSymbol('');
      setNewUnitFractional(false);
      setShowUnitModal(false);
    } catch (err) {
      setUnitError((err as Error).message);
    }
  };

  return (
    <View style={styles.screen}>
      {/* Sub-navigation bar */}
      <View style={styles.subTabBar}>
        {(
          [
            { key: 'catalog', label: `SKUs (${inventoryItems.length})` },
            { key: 'categories', label: `Categories (${categories.length})` },
            { key: 'units', label: `Units (${units.length})` },
          ] as { key: SubTab; label: string }[]
        ).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveSubTab(tab.key)}
            style={[
              styles.subTabBtn,
              activeSubTab === tab.key && styles.subTabBtnActive,
            ]}
          >
            <Text
              style={[
                styles.subTabText,
                activeSubTab === tab.key && styles.subTabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeSubTab === 'catalog' ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Search & Add Row */}
          <View style={styles.topRow}>
            <View style={styles.searchBox}>
              <Feather name="search" size={16} color={palette.slate400} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search dress, saree, pant, SKU..."
                placeholderTextColor={palette.slate400}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Feather name="x" size={16} color={palette.slate500} />
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.scanBtn}
              onPress={() => router.push('/scanner')}
            >
              <Feather name="maximize" size={18} color={palette.slate800} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => router.push('/product/new')}
            >
              <Feather name="plus" size={18} color="#FFFFFF" />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {/* ================================================================
              QUICK ITEM PICKER DROPDOWN BAR (Category -> Item/Saree -> Size/Type)
             ================================================================ */}
          <SectionCard style={styles.quickFilterCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.quickFilterHeader}>
                Quick Shop Filter Dropdowns
              </Text>
              {selectedCategoryId ||
              selectedProductId ||
              selectedVariantOption ? (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedCategoryId(null);
                    setSelectedProductId(null);
                    setSelectedVariantOption(null);
                  }}
                >
                  <Text style={styles.clearFilterText}>Reset Filters</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.dropdownRow}>
              {/* 1. Category Dropdown */}
              <TouchableOpacity
                style={[
                  styles.dropdownSelector,
                  selectedCategoryId ? styles.dropdownSelectorActive : null,
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

              {/* 2. Product / Saree / Dress Dropdown */}
              <TouchableOpacity
                style={[
                  styles.dropdownSelector,
                  selectedProductId ? styles.dropdownSelectorActive : null,
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

              {/* 3. Size / Type Dropdown (S, M, L, XL, XXL / 30..40 / Elastic, Zip) */}
              {availableVariantOptions.length > 0 ? (
                <TouchableOpacity
                  style={[
                    styles.dropdownSelector,
                    selectedVariantOption
                      ? styles.dropdownSelectorActive
                      : null,
                  ]}
                  onPress={() => setOpenDropdown('variant')}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dropdownLabel}>3. Size / Type</Text>
                    <Text style={styles.dropdownValue} numberOfLines={1}>
                      {selectedVariantOption || 'All Sizes / Types'}
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

            {/* Quick Size / Type Pills in exact input sequence */}
            {availableVariantOptions.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: spacing.sm }}
                contentContainerStyle={{ gap: 6 }}
              >
                <TouchableOpacity
                  onPress={() => setSelectedVariantOption(null)}
                  style={[
                    styles.sizePill,
                    !selectedVariantOption && styles.sizePillActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.sizePillText,
                      !selectedVariantOption && styles.sizePillTextActive,
                    ]}
                  >
                    All Sizes
                  </Text>
                </TouchableOpacity>
                {availableVariantOptions.map((opt) => {
                  const active = selectedVariantOption === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() =>
                        setSelectedVariantOption(active ? null : opt)
                      }
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

          {/* Status & Sort Order Row */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: spacing.md }}
            contentContainerStyle={{ gap: spacing.xs }}
          >
            {/* Sort Order Selector: Input Size Order vs A-Z vs Quantity */}
            <TouchableOpacity
              onPress={() =>
                setSortBy((prev) =>
                  prev === 'input_order'
                    ? 'name'
                    : prev === 'name'
                    ? 'quantity_asc'
                    : prev === 'quantity_asc'
                    ? 'quantity_desc'
                    : 'input_order'
                )
              }
              style={styles.sortChip}
            >
              <Feather name="sliders" size={12} color={palette.primary600} />
              <Text style={styles.sortChipText}>
                Order:{' '}
                {sortBy === 'input_order'
                  ? 'Size / Input Order'
                  : sortBy === 'name'
                  ? 'A–Z Alphabetical'
                  : sortBy === 'quantity_asc'
                  ? 'Lowest Stock'
                  : 'Highest Stock'}
              </Text>
            </TouchableOpacity>

            {(
              [
                { status: null, label: 'All Statuses' },
                { status: 'LOW_STOCK', label: 'Low Stock' },
                { status: 'OUT_OF_STOCK', label: 'Out of Stock' },
                { status: 'IN_STOCK', label: 'In Stock' },
              ] as { status: StockStatus | null; label: string }[]
            ).map((st) => {
              const active = selectedStatus === st.status;
              return (
                <TouchableOpacity
                  key={st.label}
                  onPress={() => setSelectedStatus(st.status)}
                  style={[
                    styles.filterChip,
                    active && styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      active && styles.filterChipTextActive,
                    ]}
                  >
                    {st.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Product Items List */}
          {filteredItems.length === 0 ? (
            <EmptyStateView
              icon="package"
              title="No Matching Products Found"
              message="Add a new product (such as Ready-Made Dresses, Pants, Nighties, Tops, or Sarees) or adjust your dropdown filters."
              actionTitle="Add New Product"
              onActionPress={() => router.push('/product/new')}
            />
          ) : (
            <View style={{ gap: spacing.sm }}>
              {filteredItems.map((item) => (
                <TouchableOpacity
                  key={item.itemKey}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/product/${item.productId}`)}
                >
                  <SectionCard style={styles.itemCard}>
                    <View style={styles.itemTopRow}>
                      <View style={{ flex: 1 }}>
                        <View style={styles.titleWithSizeRow}>
                          <Text style={styles.itemTitle}>
                            {item.productName}
                          </Text>
                          {item.variantName ? (
                            <View style={styles.sizeTagBadge}>
                              <Text style={styles.sizeTagText}>
                                {item.variantName}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.itemMeta}>
                          SKU: {item.sku} • Category: {item.categoryName}
                        </Text>
                      </View>
                      <StockStatusBadge status={item.stockStatus} size="sm" />
                    </View>

                    <View style={styles.itemBottomRow}>
                      <View style={{ gap: 4 }}>
                        <ProvenanceBadge provenance={item.quantityProvenance} />
                        <Text style={styles.countDateText}>
                          Last Physical Count:{' '}
                          {formatDisplayDate(
                            item.lastPhysicalCountDate,
                            profile?.dateFormat
                          )}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.qtyBig}>
                          {formatQuantity(
                            item.recordedQuantity,
                            item.unitSymbol
                          )}
                        </Text>
                        <Text style={styles.thresholdSmall}>
                          Min Threshold:{' '}
                          {formatQuantity(
                            item.minStockThreshold,
                            item.unitSymbol
                          )}
                        </Text>
                      </View>
                    </View>
                  </SectionCard>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      ) : null}

      {activeSubTab === 'categories' ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>
                Manage Shop Categories ({categories.length})
              </Text>
              <Text style={styles.itemMeta}>
                Add new categories, edit names, or remove unwanted categories
              </Text>
            </View>
            <PrimaryButton
              title="+ Add Category"
              onPress={openCreateCategoryModal}
            />
          </View>

          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {categories.map((cat) => {
              const count = inventoryItems.filter(
                (i) => i.categoryId === cat.id
              ).length;
              return (
                <SectionCard key={cat.id} style={styles.rowBetween}>
                  <View style={[styles.rowCenter, { flex: 1 }]}>
                    <View
                      style={[
                        styles.colorDot,
                        { backgroundColor: cat.colorHex },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{cat.name}</Text>
                      {cat.description ? (
                        <Text style={styles.itemMeta}>{cat.description}</Text>
                      ) : null}
                      <Text style={[styles.itemMeta, { fontWeight: '700' }]}>
                        {count} SKU{count === 1 ? '' : 's'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.catActionsRow}>
                    <TouchableOpacity
                      style={styles.catIconBtn}
                      onPress={() => openEditCategoryModal(cat)}
                      accessibilityLabel={`Edit ${cat.name}`}
                    >
                      <Feather
                        name="edit-2"
                        size={15}
                        color={palette.primary600}
                      />
                      <Text style={styles.catEditBtnText}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.catIconBtn, styles.catDeleteBtn]}
                      onPress={() => {
                        const fallbackCat = categories.find(
                          (c) => c.id !== cat.id
                        );
                        setReassignTargetCatId(fallbackCat?.id || null);
                        setRemovingCategory({
                          id: cat.id,
                          name: cat.name,
                          skuCount: count,
                        });
                      }}
                      accessibilityLabel={`Remove ${cat.name}`}
                    >
                      <Feather
                        name="trash-2"
                        size={15}
                        color={palette.danger600}
                      />
                      <Text style={styles.catDeleteBtnText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </SectionCard>
              );
            })}
          </View>
        </ScrollView>
      ) : null}

      {activeSubTab === 'units' ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Units of Measurement</Text>
            <PrimaryButton
              title="+ Custom Unit"
              onPress={() => setShowUnitModal(true)}
            />
          </View>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {units.map((u) => (
              <SectionCard key={u.id} style={styles.rowBetween}>
                <View>
                  <Text style={styles.itemTitle}>
                    {u.name} ({u.symbol})
                  </Text>
                  <Text style={styles.itemMeta}>
                    {u.allowFractional
                      ? 'Supports decimal / fractional quantities (e.g., 1.25)'
                      : 'Whole numbers only'}
                  </Text>
                </View>
                <Text style={styles.badgeCount}>
                  {u.isCustom ? 'Custom' : 'Standard'}
                </Text>
              </SectionCard>
            ))}
          </View>
        </ScrollView>
      ) : null}

      {/* =====================================================================
          QUICK FILTER DROPDOWN PICKER MODAL
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
                      !selectedCategoryId && styles.dropdownOptionRowActive,
                    ]}
                    onPress={() => {
                      setSelectedCategoryId(null);
                      setSelectedProductId(null);
                      setSelectedVariantOption(null);
                      setOpenDropdown(null);
                    }}
                  >
                    <Text style={styles.dropdownOptionText}>
                      All Categories ({inventoryItems.length} SKUs)
                    </Text>
                    {!selectedCategoryId ? (
                      <Feather
                        name="check"
                        size={16}
                        color={palette.primary600}
                      />
                    ) : null}
                  </TouchableOpacity>
                  {categories.map((cat) => {
                    const active = selectedCategoryId === cat.id;
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
                          setSelectedCategoryId(cat.id);
                          setSelectedProductId(null);
                          setSelectedVariantOption(null);
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
                      !selectedProductId && styles.dropdownOptionRowActive,
                    ]}
                    onPress={() => {
                      setSelectedProductId(null);
                      setSelectedVariantOption(null);
                      setOpenDropdown(null);
                    }}
                  >
                    <Text style={styles.dropdownOptionText}>
                      All Items / Styles
                    </Text>
                    {!selectedProductId ? (
                      <Feather
                        name="check"
                        size={16}
                        color={palette.primary600}
                      />
                    ) : null}
                  </TouchableOpacity>
                  {availableProducts.map((prod) => {
                    const active = selectedProductId === prod.productId;
                    return (
                      <TouchableOpacity
                        key={prod.productId}
                        style={[
                          styles.dropdownOptionRow,
                          active && styles.dropdownOptionRowActive,
                        ]}
                        onPress={() => {
                          setSelectedProductId(prod.productId);
                          setSelectedVariantOption(null);
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
                      !selectedVariantOption && styles.dropdownOptionRowActive,
                    ]}
                    onPress={() => {
                      setSelectedVariantOption(null);
                      setOpenDropdown(null);
                    }}
                  >
                    <Text style={styles.dropdownOptionText}>
                      All Sizes / Types
                    </Text>
                    {!selectedVariantOption ? (
                      <Feather
                        name="check"
                        size={16}
                        color={palette.primary600}
                      />
                    ) : null}
                  </TouchableOpacity>
                  {availableVariantOptions.map((opt) => {
                    const active = selectedVariantOption === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[
                          styles.dropdownOptionRow,
                          active && styles.dropdownOptionRowActive,
                        ]}
                        onPress={() => {
                          setSelectedVariantOption(opt);
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

      {/* Create / Edit Category Modal */}
      <Modal visible={showCatModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingCatId ? 'Edit Category' : 'Create Custom Category'}
            </Text>
            {catError ? <Text style={styles.errorText}>{catError}</Text> : null}
            <Text style={styles.label}>Category Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Ready-Made Dresses, Pants, Nighties, Tops, Sarees"
              value={newCatName}
              onChangeText={setNewCatName}
            />
            <Text style={styles.label}>Description (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Optional description"
              value={newCatDesc}
              onChangeText={setNewCatDesc}
            />
            <Text style={styles.label}>Category Badge Colour</Text>
            <View style={[styles.rowCenter, { marginTop: 6, flexWrap: 'wrap' }]}>
              {[
                '#2563EB',
                '#0D9488',
                '#7C3AED',
                '#DB2777',
                '#D97706',
                '#059669',
                '#DC2626',
                '#475569',
              ].map((hex) => (
                <TouchableOpacity
                  key={hex}
                  onPress={() => setNewCatColor(hex)}
                  style={[
                    styles.colorChoiceCircle,
                    { backgroundColor: hex },
                    newCatColor === hex && styles.colorChoiceSelected,
                  ]}
                />
              ))}
            </View>
            <View style={styles.modalActions}>
              <PrimaryButton
                title="Cancel"
                variant="outline"
                onPress={() => {
                  setEditingCatId(null);
                  setShowCatModal(false);
                }}
                style={{ flex: 1 }}
              />
              <PrimaryButton
                title={editingCatId ? 'Update Category' : 'Save Category'}
                onPress={handleSaveCategory}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Remove / Delete Category Confirmation Modal */}
      <Modal
        visible={removingCategory !== null}
        transparent
        animationType="fade"
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Remove Category "{removingCategory?.name}"?
            </Text>
            {removingCategory && removingCategory.skuCount > 0 ? (
              <>
                <Text style={styles.itemMeta}>
                  This category currently has {removingCategory.skuCount} product
                  SKU(s). Choose a category below to move those products into
                  before removing "{removingCategory.name}":
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginTop: spacing.sm,
                  }}
                >
                  {categories
                    .filter((c) => c.id !== removingCategory.id)
                    .map((c) => {
                      const active = reassignTargetCatId === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          onPress={() => setReassignTargetCatId(c.id)}
                          style={[
                            styles.sizePill,
                            active && styles.sizePillActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.sizePillText,
                              active && styles.sizePillTextActive,
                            ]}
                          >
                            {c.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                </View>
              </>
            ) : (
              <Text style={styles.itemMeta}>
                This category has 0 products and will be permanently removed from
                your list.
              </Text>
            )}

            <View style={styles.modalActions}>
              <PrimaryButton
                title="Cancel"
                variant="outline"
                onPress={() => setRemovingCategory(null)}
                style={{ flex: 1 }}
              />
              <PrimaryButton
                title="Confirm Remove"
                variant="danger"
                onPress={handleConfirmRemoveCategory}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* New Unit Modal */}
      <Modal visible={showUnitModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Unit of Measurement</Text>
            {unitError ? (
              <Text style={styles.errorText}>{unitError}</Text>
            ) : null}
            <Text style={styles.label}>Unit Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Pieces, Sets, Metres"
              value={newUnitName}
              onChangeText={setNewUnitName}
            />
            <Text style={styles.label}>Short Symbol *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., pcs, sets, m"
              value={newUnitSymbol}
              onChangeText={setNewUnitSymbol}
            />
            <View style={[styles.rowBetween, { marginTop: spacing.md }]}>
              <Text style={styles.label}>Allow Fractional Quantities?</Text>
              <Switch
                value={newUnitFractional}
                onValueChange={setNewUnitFractional}
              />
            </View>
            <View style={styles.modalActions}>
              <PrimaryButton
                title="Cancel"
                variant="outline"
                onPress={() => setShowUnitModal(false)}
                style={{ flex: 1 }}
              />
              <PrimaryButton
                title="Save Unit"
                onPress={handleCreateUnit}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getStyles() {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: palette.slate50,
    },
    subTabBar: {
      flexDirection: 'row',
      backgroundColor: palette.white,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: palette.slate200,
      gap: spacing.sm,
    },
    subTabBtn: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: radius.md,
      alignItems: 'center',
      backgroundColor: palette.slate100,
    },
    subTabBtnActive: {
      backgroundColor: palette.primary600,
    },
    subTabText: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.slate700,
    },
    subTabTextActive: {
      color: '#FFFFFF',
    },
    scrollContent: {
      padding: spacing.lg,
      paddingBottom: 36,
    },
    topRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    searchBox: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.white,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: palette.slate300,
      paddingHorizontal: spacing.md,
      gap: spacing.xs,
      height: 44,
    },
    searchInput: {
      flex: 1,
      fontSize: 13,
      color: palette.slate900,
    },
    scanBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: palette.white,
      borderWidth: 1,
      borderColor: palette.slate300,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: palette.primary600,
      paddingHorizontal: 14,
      borderRadius: radius.md,
      height: 44,
    },
    addBtnText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 13,
    },
    quickFilterCard: {
      padding: spacing.md,
      marginBottom: spacing.sm,
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
    dropdownRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.xs,
    },
    dropdownSelector: {
      flex: 1,
      minWidth: 130,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: palette.slate50,
      borderWidth: 1,
      borderColor: palette.slate300,
      borderRadius: radius.md,
      paddingHorizontal: 10,
      paddingVertical: 7,
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
      fontSize: 13,
      fontWeight: '700',
      color: palette.slate900,
      marginTop: 1,
    },
    sizePill: {
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: palette.slate300,
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
    filterChip: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      backgroundColor: palette.white,
      borderWidth: 1,
      borderColor: palette.slate300,
    },
    filterChipActive: {
      backgroundColor: palette.primary600,
      borderColor: palette.primary600,
    },
    filterChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: palette.slate700,
    },
    filterChipTextActive: {
      color: '#FFFFFF',
    },
    sortChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      backgroundColor: palette.primary50,
      borderWidth: 1,
      borderColor: palette.primary100,
    },
    sortChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.primary600,
    },
    itemCard: {
      padding: spacing.md,
    },
    itemTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    titleWithSizeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
    },
    itemTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: palette.slate900,
    },
    sizeTagBadge: {
      backgroundColor: palette.primary50,
      borderWidth: 1,
      borderColor: palette.primary100,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.sm,
    },
    sizeTagText: {
      fontSize: 12,
      fontWeight: '800',
      color: palette.primary600,
    },
    itemMeta: {
      fontSize: 12,
      color: palette.slate500,
      marginTop: 2,
    },
    itemBottomRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginTop: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: palette.slate100,
    },
    countDateText: {
      fontSize: 11,
      color: palette.slate500,
    },
    qtyBig: {
      fontSize: 18,
      fontWeight: '800',
      color: palette.slate900,
    },
    thresholdSmall: {
      fontSize: 11,
      color: palette.slate500,
      marginTop: 2,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: palette.slate900,
    },
    rowBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    rowCenter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    colorDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
    },
    badgeCount: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.slate600,
      backgroundColor: palette.slate100,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: radius.pill,
    },
    catActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    catIconBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: radius.md,
      backgroundColor: palette.primary50,
      borderWidth: 1,
      borderColor: palette.primary100,
    },
    catDeleteBtn: {
      backgroundColor: palette.danger50,
      borderColor: palette.danger100,
    },
    catEditBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.primary600,
    },
    catDeleteBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.danger600,
    },
    colorChoiceCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    colorChoiceSelected: {
      borderColor: palette.slate900,
      transform: [{ scale: 1.12 }],
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.55)',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    modalCard: {
      backgroundColor: palette.white,
      borderRadius: radius.lg,
      padding: spacing.xl,
    },
    dropdownModalCard: {
      backgroundColor: palette.white,
      borderRadius: radius.lg,
      padding: spacing.lg,
      maxHeight: 420,
    },
    dropdownOptionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
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
    modalTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: palette.slate900,
      marginBottom: spacing.sm,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: palette.slate700,
      marginTop: spacing.sm,
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
    },
    modalActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    errorText: {
      color: palette.danger600,
      fontSize: 12,
      fontWeight: '600',
      marginBottom: spacing.xs,
    },
  });
}
