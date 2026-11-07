import {
  CategoryBreakdownChart,
  StockStatusDistributionBar,
} from '@/components/charts/InventoryCharts';
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
import { useAppStore } from '@/stores/useAppStore';
import { palette, radius, shadows, spacing } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export default function DashboardScreen() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const toggleLightDark = useAppStore((s) => s.toggleLightDark);
  const categories = useAppStore((s) => s.categories);
  const inventoryItems = useAppStore((s) => s.inventoryItems);
  const recentEvents = useAppStore((s) => s.recentEvents);
  const notifications = useAppStore((s) => s.notifications);

  const today = getTodayInTimezone(profile?.timezone || 'Asia/Kolkata');

  const inStockCount = inventoryItems.filter(
    (i) => i.stockStatus === 'IN_STOCK'
  ).length;
  const lowStockCount = inventoryItems.filter(
    (i) => i.stockStatus === 'LOW_STOCK'
  ).length;
  const outOfStockCount = inventoryItems.filter(
    (i) => i.stockStatus === 'OUT_OF_STOCK'
  ).length;
  const unknownCount = inventoryItems.filter(
    (i) => i.stockStatus === 'UNKNOWN'
  ).length;

  const inwardTodayCount = recentEvents.filter(
    (e) => e.eventType === 'STOCK_INWARD' && e.eventDate === today
  ).length;

  const needsPhysicalCountCount = inventoryItems.filter(
    (i) =>
      i.quantityProvenance !== 'PHYSICAL_COUNT' ||
      i.lastPhysicalCountDate !== today
  ).length;

  const lowOrOutItems = inventoryItems
    .filter(
      (i) => i.stockStatus === 'OUT_OF_STOCK' || i.stockStatus === 'LOW_STOCK'
    )
    .sort((a, b) => (a.recordedQuantity ?? 0) - (b.recordedQuantity ?? 0))
    .slice(0, 5);

  const recentInwardEvents = recentEvents
    .filter((e) => e.eventType === 'STOCK_INWARD')
    .slice(0, 4);

  const unreadNotifications = notifications.filter((n) => !n.isRead).length;

  const categoryDist = categories
    .map((c) => {
      const catItems = inventoryItems.filter((i) => i.categoryId === c.id);
      return {
        categoryName: c.name,
        colorHex: c.colorHex,
        itemCount: catItems.length,
        lowOrOutCount: catItems.filter(
          (i) =>
            i.stockStatus === 'LOW_STOCK' || i.stockStatus === 'OUT_OF_STOCK'
        ).length,
      };
    })
    .filter((c) => c.itemCount > 0);

  const styles = getStyles();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Top Business Header */}
      <View style={styles.headerBanner}>
        <View style={{ flex: 1 }}>
          <Text style={styles.businessTypeTag}>
            {profile?.businessType || 'Inventory Workspace'} • Offline Ready
          </Text>
          <Text style={styles.businessTitle} numberOfLines={1}>
            {profile?.businessName || 'StockBeacon'}
          </Text>
          <Text style={styles.dateSubtitle}>
            Today: {formatDisplayDate(today, profile?.dateFormat)}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={toggleLightDark}
            style={styles.iconButton}
            accessibilityLabel="Toggle Light or Dark Mode"
          >
            <Feather
              name={isDarkMode ? 'sun' : 'moon'}
              size={20}
              color={isDarkMode ? '#FBBF24' : '#FFFFFF'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/scanner')}
            style={styles.iconButton}
            accessibilityLabel="Scan Barcode"
          >
            <Feather name="maximize" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/notifications')}
            style={styles.iconButton}
            accessibilityLabel="Notifications"
          >
            <Feather name="bell" size={20} color="#FFFFFF" />
            {unreadNotifications > 0 ? (
              <View style={styles.unreadDot}>
                <Text style={styles.unreadDotText}>
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      </View>

      {/* 6 KPI Summary Cards */}
      <View style={styles.kpiGrid}>
        <TouchableOpacity
          style={styles.kpiCard}
          onPress={() => router.push('/(tabs)/products')}
        >
          <View style={[styles.kpiIconWrap, { backgroundColor: palette.primary50 }]}>
            <Feather name="package" size={18} color={palette.primary600} />
          </View>
          <Text style={styles.kpiValue}>{inventoryItems.length}</Text>
          <Text style={styles.kpiLabel}>Total SKUs</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.kpiCard}
          onPress={() => router.push('/(tabs)/products')}
        >
          <View style={[styles.kpiIconWrap, { backgroundColor: palette.success50 }]}>
            <Feather name="check-circle" size={18} color={palette.success600} />
          </View>
          <Text style={[styles.kpiValue, { color: palette.success700 }]}>
            {inStockCount}
          </Text>
          <Text style={styles.kpiLabel}>In Stock</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.kpiCard,
            lowStockCount > 0 && { borderColor: palette.warning600 },
          ]}
          onPress={() => router.push('/low-stock')}
        >
          <View style={[styles.kpiIconWrap, { backgroundColor: palette.warning50 }]}>
            <Feather name="alert-triangle" size={18} color={palette.warning600} />
          </View>
          <Text style={[styles.kpiValue, { color: palette.warning700 }]}>
            {lowStockCount}
          </Text>
          <Text style={styles.kpiLabel}>Low Stock</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.kpiCard,
            outOfStockCount > 0 && { borderColor: palette.danger600 },
          ]}
          onPress={() => router.push('/low-stock')}
        >
          <View style={[styles.kpiIconWrap, { backgroundColor: palette.danger50 }]}>
            <Feather name="x-circle" size={18} color={palette.danger600} />
          </View>
          <Text style={[styles.kpiValue, { color: palette.danger700 }]}>
            {outOfStockCount}
          </Text>
          <Text style={styles.kpiLabel}>Out of Stock</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.kpiCard}
          onPress={() =>
            router.push({ pathname: '/(tabs)/stock', params: { tab: 'inward' } })
          }
        >
          <View style={[styles.kpiIconWrap, { backgroundColor: palette.sky50 }]}>
            <Feather name="arrow-down-circle" size={18} color={palette.sky700} />
          </View>
          <Text style={styles.kpiValue}>{inwardTodayCount}</Text>
          <Text style={styles.kpiLabel}>Inward Today</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.kpiCard}
          onPress={() =>
            router.push({ pathname: '/(tabs)/stock', params: { tab: 'count' } })
          }
        >
          <View style={[styles.kpiIconWrap, { backgroundColor: palette.indigo50 }]}>
            <Feather name="clipboard" size={18} color={palette.indigo700} />
          </View>
          <Text style={styles.kpiValue}>{needsPhysicalCountCount}</Text>
          <Text style={styles.kpiLabel}>Unverified Today</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Action Bar */}
      <SectionCard style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Daily Operations</Text>
        <View style={styles.quickActionGrid}>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/stock',
                params: { tab: 'inward' },
              })
            }
          >
            <Feather
              name="arrow-down-left"
              size={20}
              color={palette.primary600}
            />
            <Text style={styles.quickActionText}>Stock Inward</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/stock',
                params: { tab: 'count' },
              })
            }
          >
            <Feather name="check-square" size={20} color={palette.indigo700} />
            <Text style={styles.quickActionText}>Physical Count</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => router.push('/product/new')}
          >
            <Feather name="plus-circle" size={20} color={palette.success600} />
            <Text style={styles.quickActionText}>Add Product</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => router.push('/(tabs)/reports')}
          >
            <Feather name="calendar" size={20} color={palette.warning700} />
            <Text style={styles.quickActionText}>Date Reports</Text>
          </TouchableOpacity>
        </View>
      </SectionCard>

      {/* Immediately Visible Low-Stock & Out-of-Stock Register Section */}
      <SectionCard style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>
              Attention Required: Low & Out-of-Stock
            </Text>
            <Text style={styles.sectionSubtitle}>
              Items with recorded balance at or below minimum threshold
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/low-stock')}>
            <Text style={styles.linkText}>Full Register →</Text>
          </TouchableOpacity>
        </View>

        {lowOrOutItems.length === 0 ? (
          <View style={styles.healthyBanner}>
            <Feather
              name="check-circle"
              size={18}
              color={palette.success700}
            />
            <Text style={styles.healthyText}>
              {inventoryItems.length === 0
                ? 'No products registered yet. Add your first product to begin tracking stock.'
                : 'All tracked items with baselines are currently above their minimum stock thresholds.'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
            {lowOrOutItems.map((item) => (
              <TouchableOpacity
                key={item.itemKey}
                style={styles.lowStockRow}
                onPress={() => router.push(`/product/${item.productId}`)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.displayName}</Text>
                  <Text style={styles.itemSub}>
                    SKU: {item.sku} • {item.categoryName}
                  </Text>
                  <View style={{ marginTop: 4 }}>
                    <ProvenanceBadge provenance={item.quantityProvenance} />
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <StockStatusBadge status={item.stockStatus} size="sm" />
                  <Text style={styles.qtyReadout}>
                    {formatQuantity(item.recordedQuantity, item.unitSymbol)}{' '}
                    <Text style={styles.thresholdReadout}>
                      / Min {formatQuantity(item.minStockThreshold, item.unitSymbol)}
                    </Text>
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </SectionCard>

      {/* Stock Status Overview & Category Distribution */}
      {inventoryItems.length > 0 ? (
        <SectionCard style={styles.section}>
          <Text style={styles.sectionTitle}>Stock Health Overview</Text>
          <View style={{ marginTop: spacing.sm }}>
            <StockStatusDistributionBar
              inStockCount={inStockCount}
              lowStockCount={lowStockCount}
              outOfStockCount={outOfStockCount}
              unknownCount={unknownCount}
            />
          </View>

          {categoryDist.length > 0 ? (
            <View style={{ marginTop: spacing.lg }}>
              <Text style={[styles.sectionTitle, { fontSize: 14, marginBottom: 8 }]}>
                Category-Wise SKU Distribution
              </Text>
              <CategoryBreakdownChart data={categoryDist} />
            </View>
          ) : null}
        </SectionCard>
      ) : null}

      {/* Recently Added Stock Inward */}
      {recentInwardEvents.length > 0 ? (
        <SectionCard style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Recently Added Stock (Inward)</Text>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/stock',
                  params: { tab: 'inward' },
                })
              }
            >
              <Text style={styles.linkText}>+ Record Inward</Text>
            </TouchableOpacity>
          </View>
          <View style={{ gap: spacing.sm }}>
            {recentInwardEvents.map((ev) => (
              <View key={ev.id} style={styles.ledgerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{ev.displayName}</Text>
                  <Text style={styles.itemSub}>
                    {formatDisplayDate(ev.eventDate, profile?.dateFormat)}
                    {ev.supplierName ? ` • ${ev.supplierName}` : ''}
                    {ev.referenceNumber ? ` • Ref: ${ev.referenceNumber}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.eventDeltaText, { color: palette.success700 }]}>
                    +{formatQuantity(ev.quantity, ev.unitSymbol)}
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

      {/* Recent Stock Ledger History */}
      <SectionCard style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Recent Stock Ledger Activity</Text>
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: '/(tabs)/stock',
                params: { tab: 'ledger' },
              })
            }
          >
            <Text style={styles.linkText}>View All →</Text>
          </TouchableOpacity>
        </View>

        {recentEvents.length === 0 ? (
          <EmptyStateView
            icon="activity"
            title="No Stock Events Recorded Yet"
            message="Create products or record incoming stock deliveries and physical counts to populate your immutable stock ledger."
            actionTitle="Add First Product"
            onActionPress={() => router.push('/product/new')}
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {recentEvents.slice(0, 6).map((ev) => (
              <View key={ev.id} style={styles.ledgerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{ev.displayName}</Text>
                  <Text style={styles.itemSub}>
                    {formatEventLabel(ev.eventType)} •{' '}
                    {formatDisplayDate(ev.eventDate, profile?.dateFormat)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.eventDeltaText}>
                    {ev.eventType === 'STOCK_INWARD'
                      ? `+${formatQuantity(ev.quantity, ev.unitSymbol)}`
                      : ev.eventType === 'PHYSICAL_COUNT'
                      ? `Counted: ${formatQuantity(ev.quantity, ev.unitSymbol)}`
                      : ev.eventType === 'OPENING_STOCK'
                      ? `Opening: ${formatQuantity(ev.quantity, ev.unitSymbol)}`
                      : `${ev.quantity > 0 ? '+' : ''}${formatQuantity(
                          ev.quantity,
                          ev.unitSymbol
                        )}`}
                  </Text>
                  <Text style={styles.itemSub}>
                    Balance: {formatQuantity(ev.resultingBalance, ev.unitSymbol)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </SectionCard>
    </ScrollView>
  );
}

function formatEventLabel(type: string): string {
  switch (type) {
    case 'OPENING_STOCK':
      return 'Opening Stock';
    case 'STOCK_INWARD':
      return 'Stock Inward';
    case 'PHYSICAL_COUNT':
      return 'Physical Count';
    case 'STOCK_ADJUSTMENT':
      return 'Adjustment';
    default:
      return type;
  }
}

function getStyles() {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: palette.slate50,
    },
  scrollContent: {
    padding: spacing.lg,
    paddingTop: 50,
    paddingBottom: 36,
  },
  headerBanner: {
    backgroundColor: palette.navy900,
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    ...shadows.elevated,
  },
  businessTypeTag: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.primary500,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  businessTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  dateSubtitle: {
    fontSize: 12,
    color: '#CBD5E1',
    marginTop: 4,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  unreadDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: palette.danger600,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadDotText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  kpiCard: {
    width: '31%',
    flexGrow: 1,
    backgroundColor: palette.white,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: palette.slate200,
    ...shadows.card,
  },
  kpiIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '800',
    color: palette.slate900,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: palette.slate600,
    marginTop: 2,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.slate900,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: palette.slate500,
    marginTop: 2,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.primary600,
  },
  quickActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  quickActionBtn: {
    width: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.slate50,
    borderWidth: 1,
    borderColor: palette.slate200,
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.slate800,
  },
  healthyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.success50,
    borderColor: palette.success100,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  healthyText: {
    flex: 1,
    fontSize: 13,
    color: palette.success700,
    fontWeight: '600',
  },
  lowStockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    backgroundColor: palette.slate50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.slate200,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.slate900,
  },
  itemSub: {
    fontSize: 12,
    color: palette.slate500,
    marginTop: 2,
  },
  qtyReadout: {
    fontSize: 13,
    fontWeight: '800',
    color: palette.slate900,
  },
  thresholdReadout: {
    fontSize: 11,
    fontWeight: '500',
    color: palette.slate500,
  },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.slate100,
  },
    eventDeltaText: {
      fontSize: 13,
      fontWeight: '700',
      color: palette.primary600,
    },
  });
}
