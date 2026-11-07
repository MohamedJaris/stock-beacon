import {
  EmptyStateView,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from '@/components/common/AppComponents';
import { formatQuantity } from '@/core/utils/quantityMath';
import { StockStatus } from '@/domain/enums';
import { useAppStore } from '@/stores/useAppStore';
import { palette, radius, shadows, spacing } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type SubTab = 'catalog' | 'categories';
type ActiveDropdown = 'category' | 'product' | 'variant' | null;

export default function ProductsScreen() {
  const styles = getStyles();
  const router = useRouter();
  const inventoryItems = useAppStore((s) => s.inventoryItems);
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const categories = useAppStore((s) => s.categories);
  const addCategory = useAppStore((s) => s.addCategory);
  const updateCategory = useAppStore((s) => s.updateCategory);
  const removeCategory = useAppStore((s) => s.removeCategory);

  const [activeSubTab, setActiveSubTab] = useState<SubTab>('catalog');
  const [searchQuery, setSearchQuery] = useState('');

  // Quick Filter Dropdown States
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null
  );
  const [selectedVariantOption, setSelectedVariantOption] = useState<
    string | null
  >(null);
  const [openDropdown, setOpenDropdown] = useState<ActiveDropdown>(null);

  const [selectedStatus, setSelectedStatus] = useState<StockStatus | null>(
    null
  );
  const [sortBy, setSortBy] = useState<'input_order' | 'name'>('input_order');

  // Category modal state (Add & Edit)
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

  // Distinct products for the Quick Product Dropdown
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

  // Distinct sizes / variant names in EXACT input order
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
    searchQuery,
    selectedCategoryId,
    selectedProductId,
    selectedVariantOption,
    selectedStatus,
    sortBy,
  ]);

  const selectedCategoryName =
    categories.find((c) => c.id === selectedCategoryId)?.name || 'All';
  const selectedProductName =
    availableProducts.find((p) => p.productId === selectedProductId)
      ?.productName || 'All Items';

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

  return (
    <View style={styles.screen}>
      {/* Clean 2-Tab Bar */}
      <View style={styles.subTabBar}>
        <TouchableOpacity
          onPress={() => setActiveSubTab('catalog')}
          style={[
            styles.subTabBtn,
            activeSubTab === 'catalog' && styles.subTabBtnActive,
          ]}
        >
          <Text
            style={[
              styles.subTabText,
              activeSubTab === 'catalog' && styles.subTabTextActive,
            ]}
          >
            Products ({inventoryItems.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveSubTab('categories')}
          style={[
            styles.subTabBtn,
            activeSubTab === 'categories' && styles.subTabBtnActive,
          ]}
        >
          <Text
            style={[
              styles.subTabText,
              activeSubTab === 'categories' && styles.subTabTextActive,
            ]}
          >
            Categories ({categories.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeSubTab === 'catalog' ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Search & New Product Row */}
          <View style={styles.topRow}>
            <View style={styles.searchBox}>
              <Feather name="search" size={16} color={palette.slate400} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search item..."
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
              style={styles.addBtn}
              onPress={() => router.push('/product/new')}
            >
              <Feather name="plus" size={18} color="#FFFFFF" />
              <Text style={styles.addBtnText}>New</Text>
            </TouchableOpacity>
          </View>

          {/* Compact Cascading Filter Bar (Category -> Product -> Size/Type) */}
          <View style={styles.filterContainer}>
            <View style={styles.dropdownRow}>
              <TouchableOpacity
                style={[
                  styles.dropdownSelector,
                  selectedCategoryId ? styles.dropdownSelectorActive : null,
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

              <TouchableOpacity
                style={[
                  styles.dropdownSelector,
                  selectedProductId ? styles.dropdownSelectorActive : null,
                ]}
                onPress={() => setOpenDropdown('product')}
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
                    <Text style={styles.dropdownLabel}>Size / Type</Text>
                    <Text style={styles.dropdownValue} numberOfLines={1}>
                      {selectedVariantOption || 'All'}
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

            {/* Size / Type Pills in exact input sequence */}
            {availableVariantOptions.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: 8 }}
                contentContainerStyle={{ gap: 6 }}
              >
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

            {/* Compact Status & Sort Bar */}
            <View style={styles.statusFilterRow}>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {(
                  [
                    { status: null, label: 'All' },
                    { status: 'LOW_STOCK', label: 'Low' },
                    { status: 'OUT_OF_STOCK', label: 'Out' },
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
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {selectedCategoryId ||
                selectedProductId ||
                selectedVariantOption ||
                selectedStatus ? (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedCategoryId(null);
                      setSelectedProductId(null);
                      setSelectedVariantOption(null);
                      setSelectedStatus(null);
                    }}
                  >
                    <Text style={styles.clearFilterText}>Reset</Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  onPress={() =>
                    setSortBy((prev) =>
                      prev === 'input_order' ? 'name' : 'input_order'
                    )
                  }
                  style={styles.sortChip}
                >
                  <Feather name="sliders" size={12} color={palette.primary600} />
                  <Text style={styles.sortChipText}>
                    {sortBy === 'input_order' ? 'Size Order' : 'A–Z'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Clean Product List */}
          {filteredItems.length === 0 ? (
            <EmptyStateView
              icon="package"
              title="No Items Found"
              message="Add a new product or clear your filters."
              actionTitle="Add Product"
              onActionPress={() => router.push('/product/new')}
            />
          ) : (
            <View style={{ gap: 8 }}>
              {filteredItems.map((item) => {
                const statusColor =
                  item.stockStatus === 'OUT_OF_STOCK'
                    ? palette.danger600
                    : item.stockStatus === 'LOW_STOCK'
                    ? palette.warning600
                    : palette.success600;

                return (
                  <TouchableOpacity
                    key={item.itemKey}
                    style={styles.itemRowCard}
                    onPress={() => router.push(`/product/${item.productId}`)}
                    activeOpacity={0.75}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{item.displayName}</Text>
                      <Text style={styles.itemMeta}>
                        {item.categoryName} • Min:{' '}
                        {formatQuantity(item.minStockThreshold, item.unitSymbol)}
                      </Text>
                    </View>

                    <View style={styles.itemRightCol}>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text
                          style={[styles.qtyValueText, { color: statusColor }]}
                        >
                          {formatQuantity(
                            item.recordedQuantity,
                            item.unitSymbol
                          )}
                        </Text>
                        {item.stockStatus !== 'IN_STOCK' ? (
                          <Text
                            style={[
                              styles.statusSmallLabel,
                              { color: statusColor },
                            ]}
                          >
                            {item.stockStatus === 'OUT_OF_STOCK'
                              ? 'Out of stock'
                              : 'Low stock'}
                          </Text>
                        ) : null}
                      </View>

                      <TouchableOpacity
                        style={styles.quickAddStockBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          router.push({
                            pathname: '/(tabs)/stock',
                            params: { tab: 'inward', itemKey: item.itemKey },
                          });
                        }}
                      >
                        <Feather
                          name="plus"
                          size={14}
                          color={palette.primary600}
                        />
                        <Text style={styles.quickAddStockText}>Stock</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      ) : null}

      {activeSubTab === 'categories' ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Shop Categories</Text>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={openCreateCategoryModal}
            >
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text style={styles.addBtnText}>Add Category</Text>
            </TouchableOpacity>
          </View>

          <View style={{ gap: 8, marginTop: spacing.md }}>
            {categories.map((cat) => {
              const count = inventoryItems.filter(
                (i) => i.categoryId === cat.id
              ).length;
              return (
                <View key={cat.id} style={styles.itemRowCard}>
                  <View style={styles.catRowLeft}>
                    <View
                      style={[
                        styles.colorDot,
                        { backgroundColor: cat.colorHex || palette.primary600 },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{cat.name}</Text>
                      <Text style={styles.itemMeta}>
                        {count} {count === 1 ? 'item' : 'items'}
                        {cat.description ? ` • ${cat.description}` : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={styles.iconActionBtn}
                      onPress={() => openEditCategoryModal(cat)}
                    >
                      <Feather
                        name="edit-2"
                        size={15}
                        color={palette.primary600}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconActionBtn}
                      onPress={() => {
                        setCatError(null);
                        const fallback = categories.find(
                          (c) => c.id !== cat.id
                        );
                        setReassignTargetCatId(fallback?.id || null);
                        setRemovingCategory({
                          id: cat.id,
                          name: cat.name,
                          skuCount: count,
                        });
                      }}
                    >
                      <Feather
                        name="trash-2"
                        size={15}
                        color={palette.danger600}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
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
                ? 'Select Product'
                : 'Select Size / Type'}
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
                      All Categories ({inventoryItems.length})
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
                    <Text style={styles.dropdownOptionText}>All Products</Text>
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
              {editingCatId ? 'Edit Category' : 'Add Category'}
            </Text>
            {catError ? (
              <Text style={styles.errorText}>{catError}</Text>
            ) : null}
            <Text style={styles.inputLabel}>Category Name *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g., Sarees, Ready-Made Dresses"
              placeholderTextColor={palette.slate400}
              value={newCatName}
              onChangeText={setNewCatName}
            />
            <Text style={styles.inputLabel}>Description (Optional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Optional note..."
              placeholderTextColor={palette.slate400}
              value={newCatDesc}
              onChangeText={setNewCatDesc}
            />

            <Text style={styles.inputLabel}>Color Tag</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              {[
                '#2563EB',
                '#7C3AED',
                '#DB2777',
                '#EA580C',
                '#059669',
                '#0284C7',
                '#4F46E5',
                '#D97706',
              ].map((hex) => (
                <TouchableOpacity
                  key={hex}
                  onPress={() => setNewCatColor(hex)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: hex,
                    borderWidth: newCatColor === hex ? 3 : 0,
                    borderColor: palette.slate900,
                  }}
                />
              ))}
            </View>

            <View style={styles.modalActions}>
              <SecondaryButton
                title="Cancel"
                onPress={() => {
                  setEditingCatId(null);
                  setShowCatModal(false);
                }}
                style={{ flex: 1 }}
              />
              <PrimaryButton
                title="Save"
                onPress={handleSaveCategory}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Remove Category Confirmation Modal */}
      <Modal visible={removingCategory !== null} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Remove "{removingCategory?.name}"?
            </Text>
            {catError ? (
              <Text style={styles.errorText}>{catError}</Text>
            ) : null}

            {removingCategory && removingCategory.skuCount > 0 ? (
              <View style={{ marginVertical: spacing.sm }}>
                <Text style={styles.itemMeta}>
                  This category has {removingCategory.skuCount} item(s). Choose a
                  category to move them into:
                </Text>
                <ScrollView
                  style={{ maxHeight: 180, marginTop: spacing.sm }}
                  contentContainerStyle={{ gap: 6 }}
                >
                  {categories
                    .filter((c) => c.id !== removingCategory.id)
                    .map((targetCat) => {
                      const selected = reassignTargetCatId === targetCat.id;
                      return (
                        <TouchableOpacity
                          key={targetCat.id}
                          onPress={() => setReassignTargetCatId(targetCat.id)}
                          style={[
                            styles.dropdownOptionRow,
                            selected && styles.dropdownOptionRowActive,
                          ]}
                        >
                          <Text style={styles.dropdownOptionText}>
                            {targetCat.name}
                          </Text>
                          {selected ? (
                            <Feather
                              name="check"
                              size={16}
                              color={palette.primary600}
                            />
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                </ScrollView>
              </View>
            ) : (
              <Text style={[styles.itemMeta, { marginVertical: spacing.sm }]}>
                This category has no products and will be removed.
              </Text>
            )}

            <View style={styles.modalActions}>
              <SecondaryButton
                title="Cancel"
                onPress={() => {
                  setRemovingCategory(null);
                  setReassignTargetCatId(null);
                }}
                style={{ flex: 1 }}
              />
              <PrimaryButton
                title="Remove"
                variant="danger"
                onPress={handleConfirmRemoveCategory}
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
      paddingHorizontal: spacing.lg,
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
      fontSize: 13,
      fontWeight: '700',
      color: palette.slate700,
    },
    subTabTextActive: {
      color: '#FFFFFF',
    },
    scrollContent: {
      padding: spacing.md,
      paddingBottom: 36,
    },
    topRow: {
      flexDirection: 'row',
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    searchBox: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.white,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderColor: palette.slate200,
      gap: spacing.xs,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 9,
      fontSize: 14,
      color: palette.slate900,
    },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: palette.primary600,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: radius.md,
      justifyContent: 'center',
    },
    addBtnText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 13,
    },
    filterContainer: {
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
      paddingVertical: 7,
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
      paddingVertical: 5,
      paddingHorizontal: 11,
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
    statusFilterRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: palette.slate100,
    },
    filterChip: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: radius.pill,
      backgroundColor: palette.slate100,
    },
    filterChipActive: {
      backgroundColor: palette.navy900,
    },
    filterChipText: {
      fontSize: 11,
      fontWeight: '700',
      color: palette.slate600,
    },
    filterChipTextActive: {
      color: palette.white,
    },
    sortChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: radius.pill,
      backgroundColor: palette.primary50,
    },
    sortChipText: {
      fontSize: 11,
      fontWeight: '700',
      color: palette.primary600,
    },
    clearFilterText: {
      fontSize: 11,
      fontWeight: '700',
      color: palette.danger600,
    },
    itemRowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: palette.white,
      borderRadius: radius.md,
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderColor: palette.slate200,
      ...shadows.card,
    },
    itemTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: palette.slate900,
    },
    itemMeta: {
      fontSize: 12,
      color: palette.slate500,
      marginTop: 2,
    },
    itemRightCol: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    qtyValueText: {
      fontSize: 15,
      fontWeight: '800',
    },
    statusSmallLabel: {
      fontSize: 10,
      fontWeight: '700',
    },
    quickAddStockBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: radius.sm,
      backgroundColor: palette.primary50,
      borderWidth: 1,
      borderColor: palette.primary100,
    },
    quickAddStockText: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.primary600,
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
    catRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
    },
    colorDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    iconActionBtn: {
      width: 34,
      height: 34,
      borderRadius: radius.sm,
      backgroundColor: palette.slate50,
      borderWidth: 1,
      borderColor: palette.slate200,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.55)',
      justifyContent: 'center',
      padding: spacing.xl,
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
    inputLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: palette.slate700,
      marginTop: spacing.md,
      marginBottom: 4,
    },
    modalInput: {
      borderWidth: 1,
      borderColor: palette.slate300,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      fontSize: 14,
      color: palette.slate900,
      backgroundColor: palette.slate50,
    },
    modalActions: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.xl,
    },
    errorText: {
      color: palette.danger600,
      fontSize: 12,
      fontWeight: '600',
      marginBottom: 4,
    },
  });
}
