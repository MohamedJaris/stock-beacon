import {
  EmptyStateView,
  SectionCard,
} from '@/components/common/AppComponents';
import { StockStatusBadge } from '@/components/inventory/StatusBadge';
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
  const inventoryItems = useAppStore((s) => s.inventoryItems);
  const recentEvents = useAppStore((s) => s.recentEvents);

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

  const lowOrOutItems = inventoryItems
    .filter(
      (i) => i.stockStatus === 'OUT_OF_STOCK' || i.stockStatus === 'LOW_STOCK'
    )
    .sort((a, b) => (a.recordedQuantity ?? 0) - (b.recordedQuantity ?? 0))
    .slice(0, 6);

  const styles = getStyles();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Clean Shop Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.businessTitle} numberOfLines={1}>
            {profile?.businessName || 'StockBeacon'}
          </Text>
          <Text style={styles.dateSubtitle}>
            {formatDisplayDate(today, profile?.dateFormat)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={toggleLightDark}
          style={styles.themeBtn}
          accessibilityLabel="Toggle Light or Dark Mode"
        >
          <Feather
            name={isDarkMode ? 'sun' : 'moon'}
            size={18}
            color={isDarkMode ? '#FBBF24' : palette.slate700}
          />
        </TouchableOpacity>
      </View>

      {/* 3 Clean Summary Cards */}
      <View style={styles.kpiRow}>
        <TouchableOpacity
          style={styles.kpiCard}
          onPress={() => router.push('/(tabs)/products')}
        >
          <Text style={styles.kpiValue}>{inventoryItems.length}</Text>
          <Text style={styles.kpiLabel}>Total Items</Text>
          <Text style={[styles.kpiSub, { color: palette.success600 }]}>
            {inStockCount} in stock
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.kpiCard,
            lowStockCount > 0 && { borderColor: palette.warning600 },
          ]}
          onPress={() => router.push('/low-stock')}
        >
          <Text style={[styles.kpiValue, { color: palette.warning600 }]}>
            {lowStockCount}
          </Text>
          <Text style={styles.kpiLabel}>Low Stock</Text>
          <Text style={styles.kpiSub}>Needs restock</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.kpiCard,
            outOfStockCount > 0 && { borderColor: palette.danger600 },
          ]}
          onPress={() => router.push('/low-stock')}
        >
          <Text style={[styles.kpiValue, { color: palette.danger600 }]}>
            {outOfStockCount}
          </Text>
          <Text style={styles.kpiLabel}>Out of Stock</Text>
          <Text style={styles.kpiSub}>Zero balance</Text>
        </TouchableOpacity>
      </View>

      {/* 2 Primary Daily Action Buttons */}
      <View style={styles.primaryActionsRow}>
        <TouchableOpacity
          style={[styles.primaryActionBtn, { backgroundColor: palette.primary600 }]}
          onPress={() =>
            router.push({
              pathname: '/(tabs)/stock',
              params: { tab: 'inward' },
            })
          }
        >
          <Feather name="arrow-down-circle" size={18} color="#FFFFFF" />
          <Text style={styles.primaryActionBtnText}>Add Stock Inward</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryActionBtn}
          onPress={() => router.push('/product/new')}
        >
          <Feather name="plus" size={18} color={palette.primary600} />
          <Text style={styles.secondaryActionBtnText}>New Product</Text>
        </TouchableOpacity>
      </View>

      {/* Low & Out-of-Stock Alert List */}
      <SectionCard style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Low & Out of Stock</Text>
          {lowOrOutItems.length > 0 ? (
            <TouchableOpacity onPress={() => router.push('/low-stock')}>
              <Text style={styles.linkText}>See All</Text>
            </TouchableOpacity>
          ) : null}
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
                ? 'No products added yet. Tap "New Product" above to start.'
                : 'All items have sufficient stock above minimum levels.'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.xs }}>
            {lowOrOutItems.map((item) => (
              <TouchableOpacity
                key={item.itemKey}
                style={styles.listRow}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/stock',
                    params: { tab: 'inward', itemKey: item.itemKey },
                  })
                }
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.displayName}</Text>
                  <Text style={styles.itemSub}>
                    {item.categoryName} • Min:{' '}
                    {formatQuantity(item.minStockThreshold, item.unitSymbol)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text
                    style={[
                      styles.qtyReadout,
                      {
                        color:
                          item.stockStatus === 'OUT_OF_STOCK'
                            ? palette.danger600
                            : palette.warning600,
                      },
                    ]}
                  >
                    {formatQuantity(item.recordedQuantity, item.unitSymbol)}
                  </Text>
                  <StockStatusBadge status={item.stockStatus} size="sm" />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </SectionCard>

      {/* Recent Stock Activity */}
      <SectionCard style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {recentEvents.length > 0 ? (
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/stock',
                  params: { tab: 'ledger' },
                })
              }
            >
              <Text style={styles.linkText}>History</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {recentEvents.length === 0 ? (
          <EmptyStateView
            icon="activity"
            title="No Activity Yet"
            message="Recent stock additions and updates will appear here."
          />
        ) : (
          <View>
            {recentEvents.slice(0, 5).map((ev, idx) => (
              <View
                key={ev.id}
                style={[
                  styles.ledgerRow,
                  idx === Math.min(recentEvents.length, 5) - 1 && {
                    borderBottomWidth: 0,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{ev.displayName}</Text>
                  <Text style={styles.itemSub}>
                    {formatEventLabel(ev.eventType)} •{' '}
                    {formatDisplayDate(ev.eventDate, profile?.dateFormat)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text
                    style={[
                      styles.eventDeltaText,
                      ev.eventType === 'STOCK_INWARD' && {
                        color: palette.success600,
                      },
                    ]}
                  >
                    {ev.eventType === 'STOCK_INWARD'
                      ? `+${formatQuantity(ev.quantity, ev.unitSymbol)}`
                      : ev.eventType === 'PHYSICAL_COUNT'
                      ? `${formatQuantity(ev.quantity, ev.unitSymbol)}`
                      : ev.eventType === 'OPENING_STOCK'
                      ? `${formatQuantity(ev.quantity, ev.unitSymbol)}`
                      : `${ev.quantity > 0 ? '+' : ''}${formatQuantity(
                          ev.quantity,
                          ev.unitSymbol
                        )}`}
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
    </ScrollView>
  );
}

function formatEventLabel(type: string): string {
  switch (type) {
    case 'OPENING_STOCK':
      return 'Opening';
    case 'STOCK_INWARD':
      return 'Inward';
    case 'PHYSICAL_COUNT':
      return 'Counted';
    case 'STOCK_ADJUSTMENT':
      return 'Adjusted';
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
      paddingTop: 52,
      paddingBottom: 32,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.lg,
    },
    businessTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: palette.slate900,
    },
    dateSubtitle: {
      fontSize: 13,
      color: palette.slate500,
      marginTop: 2,
    },
    themeBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: palette.white,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: palette.slate200,
    },
    kpiRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    kpiCard: {
      flex: 1,
      backgroundColor: palette.white,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: palette.slate200,
      ...shadows.card,
    },
    kpiValue: {
      fontSize: 22,
      fontWeight: '800',
      color: palette.slate900,
    },
    kpiLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.slate700,
      marginTop: 4,
    },
    kpiSub: {
      fontSize: 11,
      color: palette.slate500,
      marginTop: 2,
    },
    primaryActionsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    primaryActionBtn: {
      flex: 1.3,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 13,
      borderRadius: radius.md,
      ...shadows.card,
    },
    primaryActionBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    secondaryActionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 13,
      borderRadius: radius.md,
      backgroundColor: palette.white,
      borderWidth: 1,
      borderColor: palette.primary600,
    },
    secondaryActionBtnText: {
      color: palette.primary600,
      fontSize: 14,
      fontWeight: '700',
    },
    section: {
      marginBottom: spacing.md,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: palette.slate900,
    },
    linkText: {
      fontSize: 13,
      fontWeight: '700',
      color: palette.primary600,
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
    listRow: {
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
      fontSize: 14,
      fontWeight: '800',
      color: palette.slate900,
    },
    ledgerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: palette.slate100,
    },
    eventDeltaText: {
      fontSize: 14,
      fontWeight: '700',
      color: palette.slate900,
    },
  });
}
