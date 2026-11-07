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
import { formatQuantity } from '@/core/utils/quantityMath';
import { getDatabase } from '@/data/database/DatabaseConnection';
import { ProductDetailBundle } from '@/data/repositories/SqliteCatalogRepository';
import {
  StockEventWithDetails,
  SqliteInventoryRepository,
} from '@/data/repositories/SqliteInventoryRepository';
import { ProductThresholdHistory } from '@/domain/entities';
import { useAppStore } from '@/stores/useAppStore';
import { palette, radius, spacing } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
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
  const recordOpeningStock = useAppStore((s) => s.recordOpeningStock);
  const setProductArchived = useAppStore((s) => s.setProductArchived);
  const inventoryItems = useAppStore((s) => s.inventoryItems);

  const [detail, setDetail] = useState<ProductDetailBundle | null>(null);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [ledgerEvents, setLedgerEvents] = useState<StockEventWithDetails[]>([]);
  const [thresholdHistory, setThresholdHistory] = useState<
    ProductThresholdHistory[]
  >([]);

  // Threshold update modal
  const [showThresholdModal, setShowThresholdModal] = useState(false);
  const [newThresholdVal, setNewThresholdVal] = useState('');
  const [thresholdDate, setThresholdDate] = useState(
    getTodayInTimezone(profile?.timezone || 'Asia/Kolkata')
  );
  const [thresholdReason, setThresholdReason] = useState('');

  // Opening baseline modal
  const [showOpeningModal, setShowOpeningModal] = useState(false);
  const [openingVal, setOpeningVal] = useState('0');
  const [openingDate, setOpeningDate] = useState(
    getTodayInTimezone(profile?.timezone || 'Asia/Kolkata')
  );

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
      const [events, thHist] = await Promise.all([
        invRepo.listStockEvents({
          workspaceId: profile.id,
          itemKey: targetKey,
          limit: 100,
        }),
        invRepo.getItemThresholdHistory(profile.id, targetKey),
      ]);
      setLedgerEvents(events);
      setThresholdHistory(thHist);
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
          title="Loading Product Details..."
          message="Fetching product ledger and historical threshold records."
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
      effectiveDate: thresholdDate,
      reason: thresholdReason.trim() || 'Threshold updated',
    });
    setShowThresholdModal(false);
    await loadData();
  };

  const handleSaveOpeningBaseline = async () => {
    const val = Number(openingVal);
    if (Number.isNaN(val) || val < 0) return;
    await recordOpeningStock({
      itemKey: activeItem.itemKey,
      productId: activeItem.productId,
      variantId: activeItem.variantId,
      quantity: val,
      eventDate: openingDate,
      notes: 'Initial baseline recorded from product detail screen',
    });
    setShowOpeningModal(false);
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
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.catLabel}>
              {detail.categoryName} • Unit: {detail.unit.name} (
              {detail.unit.symbol})
            </Text>
            <Text style={styles.productName}>{detail.product.name}</Text>
            {detail.product.description ? (
              <Text style={styles.descText}>{detail.product.description}</Text>
            ) : null}
          </View>
          {detail.product.isArchived ? (
            <View style={styles.archivedBadge}>
              <Text style={styles.archivedText}>ARCHIVED</Text>
            </View>
          ) : null}
        </View>

        {/* Variant selector if multi-variant product */}
        {detail.items.length > 1 ? (
          <View style={{ marginTop: spacing.md }}>
            <Text style={styles.subHeader}>
              Select Variant ({detail.items.length} variants)
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.xs, marginTop: 6 }}
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

        {/* Active Item Stock Summary Box */}
        <View style={styles.stockBox}>
          <View style={styles.stockBoxRow}>
            <View>
              <Text style={styles.stockBoxLabel}>Recorded Balance</Text>
              <Text style={styles.stockBoxQty}>
                {formatQuantity(
                  activeItem.recordedQuantity,
                  activeItem.unitSymbol
                )}
              </Text>
            </View>
            <StockStatusBadge status={activeItem.stockStatus} />
          </View>

          <View style={[styles.stockBoxRow, { marginTop: spacing.sm }]}>
            <ProvenanceBadge provenance={activeItem.quantityProvenance} />
            <Text style={styles.metaText}>
              Last Physical Count:{' '}
              {formatDisplayDate(
                activeItem.lastPhysicalCountDate,
                profile?.dateFormat
              )}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.stockBoxRow}>
            <View>
              <Text style={styles.metaText}>
                SKU: <Text style={styles.bold}>{activeItem.sku}</Text>
              </Text>
              {activeItem.barcode ? (
                <Text style={styles.metaText}>
                  Barcode: <Text style={styles.bold}>{activeItem.barcode}</Text>
                </Text>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.metaText}>
                Min Threshold:{' '}
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
                <Text style={styles.linkText}>Change Threshold</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Contextual Actions */}
        <View style={styles.actionsGrid}>
          {activeItem.stockStatus === 'UNKNOWN' ? (
            <PrimaryButton
              title="Set Opening Baseline"
              icon="flag"
              onPress={() => setShowOpeningModal(true)}
              style={{ flex: 1 }}
            />
          ) : null}
          <PrimaryButton
            title="+ Stock Inward"
            icon="arrow-down-left"
            onPress={() =>
              router.push({
                pathname: '/(tabs)/stock',
                params: { tab: 'inward', itemKey: activeItem.itemKey },
              })
            }
            style={{ flex: 1 }}
          />
          <PrimaryButton
            title="Physical Count"
            variant="secondary"
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

      {/* Threshold History Card */}
      <SectionCard style={styles.section}>
        <Text style={styles.sectionTitle}>
          Historical Minimum Threshold Timeline
        </Text>
        <Text style={styles.subText}>
          Past historical reports preserve the threshold that applied on each calendar date.
        </Text>
        <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
          {thresholdHistory.map((th) => (
            <View key={th.id} style={styles.historyRow}>
              <Text style={styles.historyDate}>
                Effective from{' '}
                {formatDisplayDate(th.effectiveFromDate, profile?.dateFormat)}
              </Text>
              <Text style={styles.historyVal}>
                Min: {formatQuantity(th.minStockThreshold, activeItem.unitSymbol)}
              </Text>
            </View>
          ))}
        </View>
      </SectionCard>

      {/* Immutable Stock Event Ledger */}
      <SectionCard style={styles.section}>
        <Text style={styles.sectionTitle}>
          Immutable Stock Ledger ({ledgerEvents.length})
        </Text>
        {ledgerEvents.length === 0 ? (
          <Text style={[styles.subText, { marginTop: spacing.sm }]}>
            No stock events recorded for this item yet.
          </Text>
        ) : (
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            {ledgerEvents.map((ev) => (
              <View key={ev.id} style={styles.ledgerCard}>
                <View style={styles.stockBoxRow}>
                  <Text style={styles.ledgerType}>{ev.eventType}</Text>
                  <Text style={styles.ledgerDate}>
                    {formatDisplayDate(ev.eventDate, profile?.dateFormat)}
                  </Text>
                </View>
                <View style={[styles.stockBoxRow, { marginTop: 4 }]}>
                  <Text style={styles.metaText}>
                    {ev.eventType === 'PHYSICAL_COUNT'
                      ? `Observed Count: ${formatQuantity(
                          ev.quantity,
                          ev.unitSymbol
                        )}${
                          ev.varianceQuantity !== null
                            ? ` (Count Variance: ${
                                ev.varianceQuantity > 0 ? '+' : ''
                              }${formatQuantity(
                                ev.varianceQuantity,
                                ev.unitSymbol
                              )})`
                            : ''
                        }`
                      : ev.eventType === 'STOCK_INWARD'
                      ? `Received: +${formatQuantity(
                          ev.quantity,
                          ev.unitSymbol
                        )}`
                      : `Quantity: ${formatQuantity(
                          ev.quantity,
                          ev.unitSymbol
                        )}`}
                  </Text>
                  <Text style={styles.bold}>
                    Bal: {formatQuantity(ev.resultingBalance, ev.unitSymbol)}
                  </Text>
                </View>
                {ev.reason || ev.referenceNumber || ev.notes ? (
                  <Text style={styles.noteText}>
                    {[ev.referenceNumber, ev.reason, ev.notes]
                      .filter(Boolean)
                      .join(' • ')}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      {/* Archive / Restore Product (Preserves all history) */}
      <SectionCard style={styles.section}>
        <Text style={styles.sectionTitle}>Product Lifecycle</Text>
        <Text style={styles.subText}>
          Archiving hides the product from active daily entry lists while preserving 100% of its historical stock ledger and past reports.
        </Text>
        <PrimaryButton
          title={
            detail.product.isArchived
              ? 'Restore Product to Active Catalog'
              : 'Archive Product (Keep History)'
          }
          variant={detail.product.isArchived ? 'primary' : 'outline'}
          icon="archive"
          onPress={handleToggleArchive}
          style={{ marginTop: spacing.md }}
        />
      </SectionCard>

      {/* Update Threshold Modal */}
      <Modal visible={showThresholdModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>
              Update Minimum Stock Threshold
            </Text>
            <Text style={styles.subText}>
              Historical reports prior to the effective date will continue to use the previous threshold.
            </Text>
            <Text style={styles.label}>
              New Minimum Threshold ({activeItem.unitSymbol})
            </Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={newThresholdVal}
              onChangeText={setNewThresholdVal}
            />
            <Text style={styles.label}>Effective Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={thresholdDate}
              onChangeText={setThresholdDate}
            />
            <Text style={styles.label}>Reason (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Seasonal demand increase"
              value={thresholdReason}
              onChangeText={setThresholdReason}
            />
            <View style={styles.modalActions}>
              <PrimaryButton
                title="Cancel"
                variant="outline"
                onPress={() => setShowThresholdModal(false)}
                style={{ flex: 1 }}
              />
              <PrimaryButton
                title="Save Threshold"
                onPress={handleSaveThreshold}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Set Opening Baseline Modal */}
      <Modal visible={showOpeningModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Establish Opening Stock</Text>
            <Text style={styles.label}>
              Opening Quantity ({activeItem.unitSymbol})
            </Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={openingVal}
              onChangeText={setOpeningVal}
            />
            <Text style={styles.label}>Baseline Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={openingDate}
              onChangeText={setOpeningDate}
            />
            <View style={styles.modalActions}>
              <PrimaryButton
                title="Cancel"
                variant="outline"
                onPress={() => setShowOpeningModal(false)}
                style={{ flex: 1 }}
              />
              <PrimaryButton
                title="Save Baseline"
                onPress={handleSaveOpeningBaseline}
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
    padding: spacing.lg,
    paddingBottom: 40,
  },
  section: {
    marginBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  catLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.primary600,
    textTransform: 'uppercase',
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
  archivedBadge: {
    backgroundColor: palette.warning100,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  archivedText: {
    fontSize: 10,
    fontWeight: '800',
    color: palette.warning700,
  },
  subHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.slate700,
  },
  variantChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.slate300,
    backgroundColor: palette.white,
  },
  variantChipActive: {
    backgroundColor: palette.navy900,
    borderColor: palette.navy900,
  },
  variantChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.slate700,
  },
  variantChipTextActive: {
    color: palette.white,
  },
  stockBox: {
    marginTop: spacing.md,
    backgroundColor: palette.slate50,
    borderRadius: radius.md,
    padding: spacing.md,
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
    color: palette.slate500,
    fontWeight: '600',
  },
  stockBoxQty: {
    fontSize: 24,
    fontWeight: '800',
    color: palette.slate900,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: palette.slate200,
    marginVertical: spacing.sm,
  },
  metaText: {
    fontSize: 12,
    color: palette.slate600,
  },
  bold: {
    fontWeight: '700',
    color: palette.slate900,
  },
  linkText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.primary600,
    marginTop: 2,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    marginTop: 2,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: palette.slate100,
  },
  historyDate: {
    fontSize: 12,
    color: palette.slate700,
  },
  historyVal: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.slate900,
  },
  ledgerCard: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: palette.slate50,
    borderWidth: 1,
    borderColor: palette.slate200,
  },
  ledgerType: {
    fontSize: 12,
    fontWeight: '800',
    color: palette.primary600,
  },
  ledgerDate: {
    fontSize: 11,
    color: palette.slate500,
  },
  noteText: {
    fontSize: 11,
    color: palette.slate500,
    marginTop: 4,
    fontStyle: 'italic',
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
  },
    modalActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
  });
}
