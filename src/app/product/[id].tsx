import {
  EmptyStateView,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from '@/components/common/AppComponents';
import { StockStatusBadge } from '@/components/inventory/StatusBadge';
import { formatDisplayDate, getTodayInTimezone } from '@/core/utils/dateUtils';
import { formatQuantity } from '@/core/utils/quantityMath';
import { getDatabase } from '@/data/database/DatabaseConnection';
import { ProductDetailBundle } from '@/data/repositories/SqliteCatalogRepository';
import {
  StockEventWithDetails,
  SqliteInventoryRepository,
} from '@/data/repositories/SqliteInventoryRepository';
import { useAppStore } from '@/stores/useAppStore';
import { palette, radius, spacing } from '@/theme';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function ProductDetailScreen() {
  const styles = getStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const profile = useAppStore((s) => s.profile);
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const getProductDetail = useAppStore((s) => s.getProductDetail);
  const updateMinimumThreshold = useAppStore((s) => s.updateMinimumThreshold);
  const setProductArchived = useAppStore((s) => s.setProductArchived);
  const inventoryItems = useAppStore((s) => s.inventoryItems);

  const [detail, setDetail] = useState<ProductDetailBundle | null>(null);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [ledgerEvents, setLedgerEvents] = useState<StockEventWithDetails[]>([]);

  // Threshold update modal
  const [showThresholdModal, setShowThresholdModal] = useState(false);
  const [newThresholdVal, setNewThresholdVal] = useState('');

  const loadData = useCallback(async () => {
    if (!id || !profile) return;
    const bundle = await getProductDetail(id);
    setDetail(bundle);
    if (bundle && bundle.items.length > 0) {
      const targetKey =
        selectedItemKey &&
        bundle.items.some((i) => i.itemKey === selectedItemKey)
          ? selectedItemKey
          : bundle.items[0].itemKey;
      setSelectedItemKey(targetKey);

      const db = await getDatabase();
      const invRepo = new SqliteInventoryRepository(db);
      const events = await invRepo.listStockEvents({
        workspaceId: profile.id,
        itemKey: targetKey,
        limit: 50,
      });
      setLedgerEvents(events);
    }
  }, [id, profile, getProductDetail, selectedItemKey]);

  useEffect(() => {
    loadData();
  }, [loadData, inventoryItems]);

  if (!detail) {
    return (
      <View style={{ flex: 1, padding: spacing.lg }}>
        <EmptyStateView
          icon="package"
          title="Loading..."
          message="Loading product details."
        />
      </View>
    );
  }

  const activeItem =
    detail.items.find((i) => i.itemKey === selectedItemKey) || detail.items[0];

  const handleSaveThreshold = async () => {
    const val = Number(newThresholdVal);
    if (Number.isNaN(val) || val < 0) return;
    await updateMinimumThreshold({
      itemKey: activeItem.itemKey,
      productId: activeItem.productId,
      variantId: activeItem.variantId,
      newThreshold: val,
      effectiveDate: getTodayInTimezone(profile?.timezone || 'Asia/Kolkata'),
      reason: 'Threshold updated',
    });
    setShowThresholdModal(false);
    await loadData();
  };

  const handleToggleArchive = async () => {
    const nextState = !detail.product.isArchived;
    await setProductArchived(detail.product.id, nextState);
    await loadData();
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
    >
      <SectionCard style={styles.section}>
        <Text style={styles.catLabel}>{detail.categoryName}</Text>
        <Text style={styles.productName}>{detail.product.name}</Text>
        {detail.product.description ? (
          <Text style={styles.descText}>{detail.product.description}</Text>
        ) : null}

        {/* Size / Type selector if multi-variant product */}
        {detail.items.length > 1 ? (
          <View style={{ marginTop: spacing.md }}>
            <Text style={styles.subHeader}>Sizes / Types</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, marginTop: 6 }}
            >
              {detail.items.map((vItem) => {
                const selected = vItem.itemKey === activeItem.itemKey;
                return (
                  <TouchableOpacity
                    key={vItem.itemKey}
                    onPress={() => setSelectedItemKey(vItem.itemKey)}
                    style={[
                      styles.variantChip,
                      selected && styles.variantChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.variantChipText,
                        selected && styles.variantChipTextActive,
                      ]}
                    >
                      {vItem.variantName || vItem.sku} (
                      {formatQuantity(vItem.recordedQuantity, vItem.unitSymbol)}
                      )
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* Stock Summary Box */}
        <View style={styles.stockBox}>
          <View style={styles.stockBoxRow}>
            <View>
              <Text style={styles.stockBoxLabel}>Current Stock</Text>
              <Text style={styles.stockBoxQty}>
                {formatQuantity(
                  activeItem.recordedQuantity,
                  activeItem.unitSymbol
                )}
              </Text>
            </View>
            <StockStatusBadge status={activeItem.stockStatus} />
          </View>

          <View style={styles.divider} />

          <View style={styles.stockBoxRow}>
            <Text style={styles.metaText}>
              Min Stock Alert:{' '}
              <Text style={styles.bold}>
                {formatQuantity(
                  activeItem.minStockThreshold,
                  activeItem.unitSymbol
                )}
              </Text>
            </Text>
            <TouchableOpacity
              onPress={() => {
                setNewThresholdVal(String(activeItem.minStockThreshold));
                setShowThresholdModal(true);
              }}
            >
              <Text style={styles.linkText}>Edit Minimum</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 2 Primary Actions */}
        <View style={styles.actionsGrid}>
          <PrimaryButton
            title="Add Stock"
            icon="plus"
            onPress={() =>
              router.push({
                pathname: '/(tabs)/stock',
                params: { tab: 'inward', itemKey: activeItem.itemKey },
              })
            }
            style={{ flex: 1 }}
          />
          <SecondaryButton
            title="Update Count"
            icon="check-square"
            onPress={() =>
              router.push({
                pathname: '/(tabs)/stock',
                params: { tab: 'count', itemKey: activeItem.itemKey },
              })
            }
            style={{ flex: 1 }}
          />
        </View>
      </SectionCard>

      {/* Stock History */}
      <SectionCard style={styles.section}>
        <Text style={styles.sectionTitle}>
          Stock History ({ledgerEvents.length})
        </Text>
        {ledgerEvents.length === 0 ? (
          <Text style={[styles.subText, { marginTop: spacing.sm }]}>
            No stock entries yet.
          </Text>
        ) : (
          <View style={{ gap: 8, marginTop: spacing.sm }}>
            {ledgerEvents.map((ev) => (
              <View key={ev.id} style={styles.ledgerCard}>
                <View style={styles.stockBoxRow}>
                  <Text style={styles.ledgerType}>
                    {ev.eventType === 'STOCK_INWARD'
                      ? 'Stock Inward'
                      : ev.eventType === 'PHYSICAL_COUNT'
                      ? 'Count Updated'
                      : ev.eventType === 'OPENING_STOCK'
                      ? 'Opening Stock'
                      : 'Adjusted'}
                  </Text>
                  <Text style={styles.ledgerDate}>
                    {formatDisplayDate(ev.eventDate, profile?.dateFormat)}
                  </Text>
                </View>
                <View style={[styles.stockBoxRow, { marginTop: 4 }]}>
                  <Text style={styles.metaText}>
                    {ev.eventType === 'STOCK_INWARD'
                      ? `+${formatQuantity(ev.quantity, ev.unitSymbol)}`
                      : formatQuantity(ev.quantity, ev.unitSymbol)}
                  </Text>
                  <Text style={styles.bold}>
                    Bal: {formatQuantity(ev.resultingBalance, ev.unitSymbol)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      <TouchableOpacity
        style={styles.archiveBtn}
        onPress={handleToggleArchive}
      >
        <Text style={styles.archiveBtnText}>
          {detail.product.isArchived
            ? 'Restore Product to Active List'
            : 'Archive Product'}
        </Text>
      </TouchableOpacity>

      {/* Edit Minimum Modal */}
      <Modal visible={showThresholdModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Minimum Stock Alert</Text>
            <Text style={styles.label}>
              Minimum Quantity ({activeItem.unitSymbol})
            </Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={newThresholdVal}
              onChangeText={setNewThresholdVal}
            />
            <View style={styles.modalActions}>
              <SecondaryButton
                title="Cancel"
                onPress={() => setShowThresholdModal(false)}
                style={{ flex: 1 }}
              />
              <PrimaryButton
                title="Save"
                onPress={handleSaveThreshold}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function getStyles() {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: palette.slate50,
    },
    scrollContent: {
      padding: spacing.md,
      paddingBottom: 40,
    },
    section: {
      marginBottom: spacing.md,
    },
    catLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.primary600,
    },
    productName: {
      fontSize: 20,
      fontWeight: '800',
      color: palette.slate900,
      marginTop: 2,
    },
    descText: {
      fontSize: 13,
      color: palette.slate600,
      marginTop: 4,
    },
    subHeader: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.slate600,
    },
    variantChip: {
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      backgroundColor: palette.slate100,
      borderWidth: 1,
      borderColor: palette.slate300,
    },
    variantChipActive: {
      backgroundColor: palette.primary600,
      borderColor: palette.primary600,
    },
    variantChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.slate700,
    },
    variantChipTextActive: {
      color: '#FFFFFF',
    },
    stockBox: {
      marginTop: spacing.md,
      padding: spacing.md,
      backgroundColor: palette.slate50,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: palette.slate200,
    },
    stockBoxRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    stockBoxLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: palette.slate500,
    },
    stockBoxQty: {
      fontSize: 24,
      fontWeight: '800',
      color: palette.slate900,
    },
    divider: {
      height: 1,
      backgroundColor: palette.slate200,
      marginVertical: spacing.sm,
    },
    metaText: {
      fontSize: 13,
      color: palette.slate600,
    },
    bold: {
      fontWeight: '700',
      color: palette.slate900,
    },
    linkText: {
      fontSize: 13,
      fontWeight: '700',
      color: palette.primary600,
    },
    actionsGrid: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: palette.slate900,
    },
    subText: {
      fontSize: 12,
      color: palette.slate500,
    },
    ledgerCard: {
      padding: spacing.sm,
      backgroundColor: palette.slate50,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: palette.slate200,
    },
    ledgerType: {
      fontSize: 13,
      fontWeight: '700',
      color: palette.slate900,
    },
    ledgerDate: {
      fontSize: 12,
      color: palette.slate500,
    },
    archiveBtn: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    archiveBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: palette.slate500,
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
    modalActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
  });
}
