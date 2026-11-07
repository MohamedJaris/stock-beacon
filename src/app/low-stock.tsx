import {
  buildCurrentInventoryCsv,
  buildHtmlReportForPdf,
  exportAndShareReportFile,
  formatProvenanceLabel,
  formatStockStatusLabel,
} from '@/application/services/ReportExportService';
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
import { useAppStore } from '@/stores/useAppStore';
import { palette, radius, spacing } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function LowStockRegisterScreen() {
  const styles = getStyles();
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const inventoryItems = useAppStore((s) => s.inventoryItems);
  const categories = useAppStore((s) => s.categories);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );
  const [onlyOutOfStock, setOnlyOutOfStock] = useState(false);

  const lowStockItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return inventoryItems
      .filter((item) => {
        if (onlyOutOfStock) {
          if (item.stockStatus !== 'OUT_OF_STOCK') return false;
        } else {
          if (
            item.stockStatus !== 'LOW_STOCK' &&
            item.stockStatus !== 'OUT_OF_STOCK'
          ) {
            return false;
          }
        }
        if (selectedCategoryId && item.categoryId !== selectedCategoryId) {
          return false;
        }
        if (q) {
          const matchName = item.displayName.toLowerCase().includes(q);
          const matchSku = item.sku.toLowerCase().includes(q);
          if (!matchName && !matchSku) return false;
        }
        return true;
      })
      .sort((a, b) => (a.recordedQuantity ?? 0) - (b.recordedQuantity ?? 0));
  }, [inventoryItems, searchQuery, selectedCategoryId, onlyOutOfStock]);

  const handleExport = async (format: 'csv' | 'pdf') => {
    if (!profile) return;
    const csv = buildCurrentInventoryCsv(
      profile,
      lowStockItems,
      'Low-Stock & Out-of-Stock Register'
    );
    const html = buildHtmlReportForPdf({
      business: profile,
      reportTitle: 'Low-Stock & Out-of-Stock Register',
      dateRangeLabel: `As of ${new Date().toISOString().slice(0, 10)}`,
      headers: [
        'Product / Variant',
        'SKU',
        'Category',
        'Recorded Qty',
        'Min Threshold',
        'Reorder Qty',
        'Status',
        'Quantity Basis',
        'Last Physical Count',
      ],
      rows: lowStockItems.map((i) => [
        i.displayName,
        i.sku,
        i.categoryName,
        formatQuantity(i.recordedQuantity, i.unitSymbol),
        formatQuantity(i.minStockThreshold, i.unitSymbol),
        i.reorderQuantity
          ? formatQuantity(i.reorderQuantity, i.unitSymbol)
          : '-',
        formatStockStatusLabel(i.stockStatus),
        formatProvenanceLabel(i.quantityProvenance),
        formatDisplayDate(i.lastPhysicalCountDate, profile.dateFormat),
      ]),
    });

    await exportAndShareReportFile({
      format,
      fileNamePrefix: 'low_stock_register',
      csvContent: csv,
      htmlContent: html,
    });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Top Filter & Export Bar */}
      <SectionCard style={styles.section}>
        <View style={styles.searchRow}>
          <Feather name="search" size={16} color={palette.slate400} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search low-stock products by name or SKU..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: spacing.sm }}
          contentContainerStyle={{ gap: spacing.xs }}
        >
          <TouchableOpacity
            onPress={() => setOnlyOutOfStock(false)}
            style={[styles.chip, !onlyOutOfStock && styles.chipActive]}
          >
            <Text
              style={[
                styles.chipText,
                !onlyOutOfStock && styles.chipTextActive,
              ]}
            >
              Low + Out of Stock
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setOnlyOutOfStock(true)}
            style={[styles.chip, onlyOutOfStock && styles.chipActive]}
          >
            <Text
              style={[
                styles.chipText,
                onlyOutOfStock && styles.chipTextActive,
              ]}
            >
              Out of Stock Only
            </Text>
          </TouchableOpacity>
          {categories.map((cat) => {
            const active = selectedCategoryId === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setSelectedCategoryId(active ? null : cat.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.exportRow}>
          <PrimaryButton
            title="Export CSV"
            variant="outline"
            icon="download"
            onPress={() => handleExport('csv')}
            style={{ flex: 1 }}
          />
          <PrimaryButton
            title="Export PDF"
            variant="secondary"
            icon="file-text"
            onPress={() => handleExport('pdf')}
            style={{ flex: 1 }}
          />
        </View>
      </SectionCard>

      {lowStockItems.length === 0 ? (
        <EmptyStateView
          icon="check-circle"
          title="No Low-Stock Items Found"
          message="All matching inventory items are currently above their configured minimum stock thresholds."
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {lowStockItems.map((item) => (
            <TouchableOpacity
              key={item.itemKey}
              onPress={() => router.push(`/product/${item.productId}`)}
            >
              <SectionCard>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{item.displayName}</Text>
                    <Text style={styles.itemMeta}>
                      SKU: {item.sku} • Category: {item.categoryName}
                    </Text>
                  </View>
                  <StockStatusBadge status={item.stockStatus} size="sm" />
                </View>

                <View style={styles.metricsRow}>
                  <View>
                    <Text style={styles.metricLabel}>Recorded Qty</Text>
                    <Text style={styles.metricValue}>
                      {formatQuantity(item.recordedQuantity, item.unitSymbol)}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.metricLabel}>Minimum Threshold</Text>
                    <Text style={styles.metricValue}>
                      {formatQuantity(item.minStockThreshold, item.unitSymbol)}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.metricLabel}>Suggested Reorder</Text>
                    <Text style={styles.metricValue}>
                      {item.reorderQuantity !== null
                        ? formatQuantity(item.reorderQuantity, item.unitSymbol)
                        : 'Not set'}
                    </Text>
                  </View>
                </View>

                <View style={[styles.rowBetween, { marginTop: spacing.sm }]}>
                  <ProvenanceBadge provenance={item.quantityProvenance} />
                  <Text style={styles.itemMeta}>
                    Last Count:{' '}
                    {formatDisplayDate(
                      item.lastPhysicalCountDate,
                      profile?.dateFormat
                    )}
                  </Text>
                </View>
              </SectionCard>
            </TouchableOpacity>
          ))}
        </View>
      )}
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
    paddingBottom: 36,
  },
  section: {
    marginBottom: spacing.lg,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.slate50,
    borderWidth: 1,
    borderColor: palette.slate300,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: palette.slate900,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.slate300,
    backgroundColor: palette.white,
  },
  chipActive: {
    backgroundColor: palette.navy900,
    borderColor: palette.navy900,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.slate700,
  },
  chipTextActive: {
    color: palette.white,
  },
  exportRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.slate900,
  },
  itemMeta: {
    fontSize: 12,
    color: palette.slate500,
    marginTop: 2,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: palette.slate50,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  metricLabel: {
    fontSize: 11,
    color: palette.slate500,
  },
    metricValue: {
      fontSize: 14,
      fontWeight: '800',
      color: palette.slate900,
      marginTop: 2,
    },
  });
}
