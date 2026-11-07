import {
  buildConsolidatedLowStockCsv,
  buildCurrentInventoryCsv,
  buildDailyLowStockCsv,
  buildHtmlReportForPdf,
  buildStockEventsCsv,
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
import {
  addDays,
  formatDisplayDate,
  formatReadableDate,
  getTodayInTimezone,
  isValidIsoDate,
} from '@/core/utils/dateUtils';
import { formatQuantity } from '@/core/utils/quantityMath';
import { getDatabase } from '@/data/database/DatabaseConnection';
import { SqliteInventoryRepository } from '@/data/repositories/SqliteInventoryRepository';
import {
  ConsolidatedLowStockReportResult,
  DailyLowStockReportResult,
} from '@/domain/services/HistoricalReportEngine';
import { useAppStore } from '@/stores/useAppStore';
import { palette, radius, spacing } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type ReportMode =
  | 'daily_low_stock'
  | 'consolidated_low_stock'
  | 'current_inventory'
  | 'inward_register'
  | 'physical_counts'
  | 'adjustments';

export default function ReportsScreen() {
  const styles = getStyles();
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const categories = useAppStore((s) => s.categories);
  const inventoryItems = useAppStore((s) => s.inventoryItems);
  const recentEvents = useAppStore((s) => s.recentEvents);

  const today = getTodayInTimezone(profile?.timezone || 'Asia/Kolkata');

  const [reportMode, setReportMode] = useState<ReportMode>('daily_low_stock');
  const [startDate, setStartDate] = useState(addDays(today, -4));
  const [endDate, setEndDate] = useState(today);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [includeAllDailyStatuses, setIncludeAllDailyStatuses] = useState(false);

  const [dailyReport, setDailyReport] =
    useState<DailyLowStockReportResult | null>(null);
  const [consolidatedReport, setConsolidatedReport] =
    useState<ConsolidatedLowStockReportResult | null>(null);
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>(
    {}
  );
  const [dateError, setDateError] = useState<string | null>(null);

  const runHistoricalQuery = useCallback(async () => {
    if (!profile) return;
    setDateError(null);
    if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) {
      setDateError('Please enter valid dates in YYYY-MM-DD format.');
      return;
    }
    if (startDate > endDate) {
      setDateError(
        `Start date (${startDate}) cannot be later than end date (${endDate}).`
      );
      return;
    }

    try {
      const db = await getDatabase();
      const invRepo = new SqliteInventoryRepository(db);

      const [daily, consolidated] = await Promise.all([
        invRepo.getDailyLowStockHistoryReport({
          workspaceId: profile.id,
          startDate,
          endDate,
          categoryId: selectedCategoryId,
          searchQuery,
          includeAllStatuses: includeAllDailyStatuses,
        }),
        invRepo.getConsolidatedLowStockReport({
          workspaceId: profile.id,
          startDate,
          endDate,
          categoryId: selectedCategoryId,
          searchQuery,
        }),
      ]);

      setDailyReport(daily);
      setConsolidatedReport(consolidated);

      // Expand all dates with items by default
      const initialExpanded: Record<string, boolean> = {};
      for (const d of daily.days) {
        initialExpanded[d.date] = true;
      }
      setExpandedDates(initialExpanded);
    } catch (err) {
      setDateError((err as Error).message);
    }
  }, [
    profile,
    startDate,
    endDate,
    selectedCategoryId,
    searchQuery,
    includeAllDailyStatuses,
  ]);

  useEffect(() => {
    runHistoricalQuery();
  }, [runHistoricalQuery, inventoryItems, recentEvents]);

  const applyDatePreset = (daysBack: number) => {
    setStartDate(addDays(today, -daysBack));
    setEndDate(today);
  };

  const handleExport = async (format: 'csv' | 'pdf') => {
    if (!profile) return;

    if (reportMode === 'daily_low_stock' && dailyReport) {
      const csv = buildDailyLowStockCsv(profile, dailyReport);
      const rows: (string | number | null)[][] = [];
      for (const day of dailyReport.days) {
        if (day.items.length === 0) {
          rows.push([day.date, 'No low-stock items', '-', '-', '-', '-', '-']);
        } else {
          for (const item of day.items) {
            rows.push([
              day.date,
              item.displayName,
              item.sku,
              formatQuantity(item.recordedQuantity, item.unitSymbol),
              formatQuantity(item.minStockThreshold, item.unitSymbol),
              formatStockStatusLabel(item.stockStatus),
              formatProvenanceLabel(item.quantitySource),
            ]);
          }
        }
      }
      const html = buildHtmlReportForPdf({
        business: profile,
        reportTitle: includeAllDailyStatuses
          ? 'Daily Stock History Report'
          : 'Daily Low-Stock History Report',
        dateRangeLabel: `${startDate} to ${endDate} (Inclusive)`,
        headers: [
          'Date',
          'Product / Variant',
          'SKU',
          'Quantity',
          'Historical Minimum',
          'Status',
          'Quantity Source',
        ],
        rows,
      });
      await exportAndShareReportFile({
        format,
        fileNamePrefix: 'daily_low_stock_history',
        csvContent: csv,
        htmlContent: html,
      });
      return;
    }

    if (reportMode === 'consolidated_low_stock' && consolidatedReport) {
      const csv = buildConsolidatedLowStockCsv(profile, consolidatedReport);
      const html = buildHtmlReportForPdf({
        business: profile,
        reportTitle: 'Consolidated Low-Stock Report',
        dateRangeLabel: `${startDate} to ${endDate} (Inclusive)`,
        headers: [
          'Product / Variant',
          'SKU',
          'Category',
          'Minimum',
          'Lowest Qty',
          'Low-Stock Days',
          'Out-of-Stock Days',
          'First Date',
          'Last Date',
        ],
        rows: consolidatedReport.items.map((i) => [
          i.displayName,
          i.sku,
          i.categoryName,
          formatQuantity(i.applicableThreshold, i.unitSymbol),
          formatQuantity(i.lowestRecordedQuantity, i.unitSymbol),
          i.lowStockDays,
          i.outOfStockDays,
          i.firstLowStockDate,
          i.lastLowStockDate,
        ]),
      });
      await exportAndShareReportFile({
        format,
        fileNamePrefix: 'consolidated_low_stock_report',
        csvContent: csv,
        htmlContent: html,
      });
      return;
    }

    if (reportMode === 'current_inventory') {
      const csv = buildCurrentInventoryCsv(
        profile,
        inventoryItems,
        'Current Inventory Report'
      );
      const html = buildHtmlReportForPdf({
        business: profile,
        reportTitle: 'Current Inventory & Category Report',
        dateRangeLabel: `As of ${today}`,
        headers: [
          'Product / Variant',
          'SKU',
          'Category',
          'Recorded Qty',
          'Minimum',
          'Status',
          'Provenance',
        ],
        rows: inventoryItems.map((i) => [
          i.displayName,
          i.sku,
          i.categoryName,
          formatQuantity(i.recordedQuantity, i.unitSymbol),
          formatQuantity(i.minStockThreshold, i.unitSymbol),
          formatStockStatusLabel(i.stockStatus),
          formatProvenanceLabel(i.quantityProvenance),
        ]),
      });
      await exportAndShareReportFile({
        format,
        fileNamePrefix: 'current_inventory_report',
        csvContent: csv,
        htmlContent: html,
      });
      return;
    }

    // Event-based reports (inward, physical count, adjustments)
    const targetType =
      reportMode === 'inward_register'
        ? 'STOCK_INWARD'
        : reportMode === 'physical_counts'
        ? 'PHYSICAL_COUNT'
        : 'STOCK_ADJUSTMENT';
    const filteredEvents = recentEvents.filter(
      (e) =>
        e.eventType === targetType &&
        e.eventDate >= startDate &&
        e.eventDate <= endDate
    );
    const title =
      reportMode === 'inward_register'
        ? 'Stock Inward Report'
        : reportMode === 'physical_counts'
        ? 'Physical Stock-Count Report'
        : 'Stock Adjustment Report';

    const csv = buildStockEventsCsv(
      profile,
      filteredEvents,
      title,
      `${startDate} to ${endDate}`
    );
    const html = buildHtmlReportForPdf({
      business: profile,
      reportTitle: title,
      dateRangeLabel: `${startDate} to ${endDate}`,
      headers: [
        'Date',
        'Product / Variant',
        'SKU',
        'Quantity / Count',
        'Resulting Balance',
        'Variance / Reference',
      ],
      rows: filteredEvents.map((e) => [
        e.eventDate,
        e.displayName,
        e.sku,
        formatQuantity(e.quantity, e.unitSymbol),
        formatQuantity(e.resultingBalance, e.unitSymbol),
        e.varianceQuantity !== null
          ? `Variance: ${e.varianceQuantity}`
          : e.referenceNumber || e.reason || '-',
      ]),
    });
    await exportAndShareReportFile({
      format,
      fileNamePrefix: reportMode,
      csvContent: csv,
      htmlContent: html,
    });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Report Mode Selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: spacing.md }}
        contentContainerStyle={{ gap: spacing.xs }}
      >
        {(
          [
            {
              key: 'daily_low_stock',
              label: 'Report A: Daily Low-Stock History',
            },
            {
              key: 'consolidated_low_stock',
              label: 'Report B: Consolidated Low-Stock',
            },
            { key: 'current_inventory', label: 'Current & Category Inventory' },
            { key: 'inward_register', label: 'Stock Inward Report' },
            { key: 'physical_counts', label: 'Physical Count Report' },
            { key: 'adjustments', label: 'Stock Adjustment Report' },
          ] as { key: ReportMode; label: string }[]
        ).map((m) => {
          const active = reportMode === m.key;
          return (
            <TouchableOpacity
              key={m.key}
              onPress={() => setReportMode(m.key)}
              style={[styles.modeTab, active && styles.modeTabActive]}
            >
              <Text
                style={[styles.modeTabText, active && styles.modeTabTextActive]}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Date Range & Filter Controls */}
      <SectionCard style={styles.section}>
        <Text style={styles.sectionTitle}>
          Inclusive Date Range & Report Filters
        </Text>

        {dateError ? (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={15} color={palette.danger700} />
            <Text style={styles.errorText}>{dateError}</Text>
          </View>
        ) : null}

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Start Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={startDate}
              onChangeText={setStartDate}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>End Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={endDate}
              onChangeText={setEndDate}
            />
          </View>
        </View>

        <View style={styles.presetRow}>
          <TouchableOpacity
            style={styles.presetChip}
            onPress={() => applyDatePreset(4)}
          >
            <Text style={styles.presetChipText}>Last 5 Days</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.presetChip}
            onPress={() => applyDatePreset(6)}
          >
            <Text style={styles.presetChipText}>Last 7 Days</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.presetChip}
            onPress={() => applyDatePreset(29)}
          >
            <Text style={styles.presetChipText}>Last 30 Days</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={[styles.input, { marginTop: spacing.sm }]}
          placeholder="Filter by product name or SKU..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: spacing.sm }}
          contentContainerStyle={{ gap: spacing.xs }}
        >
          <TouchableOpacity
            onPress={() => setSelectedCategoryId(null)}
            style={[
              styles.presetChip,
              !selectedCategoryId && styles.presetChipActive,
            ]}
          >
            <Text
              style={[
                styles.presetChipText,
                !selectedCategoryId && styles.presetChipTextActive,
              ]}
            >
              All Categories
            </Text>
          </TouchableOpacity>
          {categories.map((cat) => {
            const active = selectedCategoryId === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setSelectedCategoryId(active ? null : cat.id)}
                style={[styles.presetChip, active && styles.presetChipActive]}
              >
                <Text
                  style={[
                    styles.presetChipText,
                    active && styles.presetChipTextActive,
                  ]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {reportMode === 'daily_low_stock' ? (
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>
              Show In-Stock Products Also (Full Daily Stock History)
            </Text>
            <Switch
              value={includeAllDailyStatuses}
              onValueChange={setIncludeAllDailyStatuses}
            />
          </View>
        ) : null}

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

      {/* ================================================================
          REPORT A: DAILY LOW-STOCK HISTORY
         ================================================================ */}
      {reportMode === 'daily_low_stock' && dailyReport ? (
        <View style={{ gap: spacing.sm }}>
          {dailyReport.days.map((day) => {
            const isExpanded = Boolean(expandedDates[day.date]);
            return (
              <SectionCard key={day.date} style={{ padding: spacing.md }}>
                <TouchableOpacity
                  style={styles.dayHeader}
                  onPress={() =>
                    setExpandedDates((prev) => ({
                      ...prev,
                      [day.date]: !prev[day.date],
                    }))
                  }
                >
                  <View>
                    <Text style={styles.dayTitle}>
                      {formatReadableDate(day.date)} ({day.date})
                    </Text>
                    <Text style={styles.daySubtitle}>
                      {day.totalLowOrOutCount} Low/Out-of-Stock •{' '}
                      {day.items.length} shown
                    </Text>
                  </View>
                  <Feather
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={palette.slate600}
                  />
                </TouchableOpacity>

                {isExpanded ? (
                  <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
                    {day.items.length === 0 ? (
                      <Text style={styles.emptyDayText}>
                        No products were below their applicable minimum stock threshold at the end of {day.date}.
                      </Text>
                    ) : (
                      day.items.map((item) => (
                        <TouchableOpacity
                          key={`${day.date}:${item.itemKey}`}
                          style={styles.reportItemRow}
                          onPress={() =>
                            router.push(`/product/${item.productId}`)
                          }
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemTitle}>
                              {item.displayName}
                            </Text>
                            <Text style={styles.itemSub}>
                              SKU: {item.sku} • {item.categoryName}
                            </Text>
                            <View style={{ marginTop: 4 }}>
                              <ProvenanceBadge
                                provenance={item.quantitySource}
                              />
                            </View>
                          </View>
                          <View style={{ alignItems: 'flex-end', gap: 4 }}>
                            <StockStatusBadge
                              status={item.stockStatus}
                              size="sm"
                            />
                            <Text style={styles.qtyText}>
                              Qty:{' '}
                              {formatQuantity(
                                item.recordedQuantity,
                                item.unitSymbol
                              )}
                            </Text>
                            <Text style={styles.itemSub}>
                              Min on {day.date}:{' '}
                              {formatQuantity(
                                item.minStockThreshold,
                                item.unitSymbol
                              )}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                ) : null}
              </SectionCard>
            );
          })}
        </View>
      ) : null}

      {/* ================================================================
          REPORT B: CONSOLIDATED LOW-STOCK REPORT
         ================================================================ */}
      {reportMode === 'consolidated_low_stock' && consolidatedReport ? (
        <View style={{ gap: spacing.sm }}>
          <SectionCard>
            <Text style={styles.sectionTitle}>
              Consolidated Low-Stock Summary ({consolidatedReport.items.length}{' '}
              Unique SKUs)
            </Text>
            <Text style={styles.daySubtitle}>
              Each unique product/variant that entered LOW_STOCK or OUT_OF_STOCK between {startDate} and {endDate} appears exactly once.
            </Text>

            {consolidatedReport.items.length === 0 ? (
              <View style={{ marginTop: spacing.md }}>
                <EmptyStateView
                  icon="check-circle"
                  title="Zero Low-Stock Occurrences in Period"
                  message={`No products entered low-stock or out-of-stock status between ${startDate} and ${endDate}.`}
                />
              </View>
            ) : (
              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                {consolidatedReport.items.map((item) => (
                  <TouchableOpacity
                    key={item.itemKey}
                    style={styles.consolidatedCard}
                    onPress={() => router.push(`/product/${item.productId}`)}
                  >
                    <View style={styles.dayHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle}>{item.displayName}</Text>
                        <Text style={styles.itemSub}>
                          SKU: {item.sku} • Category: {item.categoryName}
                        </Text>
                      </View>
                      <View style={styles.daysBadge}>
                        <Text style={styles.daysBadgeText}>
                          {item.totalAffectedDays} Affected Day
                          {item.totalAffectedDays === 1 ? '' : 's'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.statsGrid}>
                      <View>
                        <Text style={styles.statLabel}>Lowest Qty</Text>
                        <Text style={styles.statValue}>
                          {formatQuantity(
                            item.lowestRecordedQuantity,
                            item.unitSymbol
                          )}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.statLabel}>Threshold</Text>
                        <Text style={styles.statValue}>
                          {formatQuantity(
                            item.applicableThreshold,
                            item.unitSymbol
                          )}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.statLabel}>Low-Stock Days</Text>
                        <Text style={styles.statValue}>{item.lowStockDays}</Text>
                      </View>
                      <View>
                        <Text style={styles.statLabel}>Out-of-Stock Days</Text>
                        <Text style={styles.statValue}>
                          {item.outOfStockDays}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.dayHeader, { marginTop: spacing.sm }]}>
                      <Text style={styles.itemSub}>
                        First: {item.firstLowStockDate} • Last:{' '}
                        {item.lastLowStockDate}
                      </Text>
                      <Text style={styles.linkText}>View History →</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </SectionCard>
        </View>
      ) : null}

      {/* ================================================================
          ADDITIONAL REPORTS: CURRENT INVENTORY, INWARD, COUNTS, ADJUSTMENTS
         ================================================================ */}
      {reportMode === 'current_inventory' ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>
            Current Inventory & Category Report ({inventoryItems.length} SKUs)
          </Text>
          <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
            {inventoryItems.map((i) => (
              <View key={i.itemKey} style={styles.reportItemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{i.displayName}</Text>
                  <Text style={styles.itemSub}>
                    {i.sku} • {i.categoryName}
                  </Text>
                  <ProvenanceBadge provenance={i.quantityProvenance} />
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <StockStatusBadge status={i.stockStatus} size="sm" />
                  <Text style={styles.qtyText}>
                    {formatQuantity(i.recordedQuantity, i.unitSymbol)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </SectionCard>
      ) : null}

      {reportMode === 'inward_register' ||
      reportMode === 'physical_counts' ||
      reportMode === 'adjustments' ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>
            {reportMode === 'inward_register'
              ? 'Stock Inward Report'
              : reportMode === 'physical_counts'
              ? 'Physical Stock-Count Reconciliation Report'
              : 'Stock Adjustment Audit Report'}
          </Text>
          <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
            {recentEvents
              .filter((e) => {
                const target =
                  reportMode === 'inward_register'
                    ? 'STOCK_INWARD'
                    : reportMode === 'physical_counts'
                    ? 'PHYSICAL_COUNT'
                    : 'STOCK_ADJUSTMENT';
                return (
                  e.eventType === target &&
                  e.eventDate >= startDate &&
                  e.eventDate <= endDate
                );
              })
              .map((ev) => (
                <View key={ev.id} style={styles.reportItemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{ev.displayName}</Text>
                    <Text style={styles.itemSub}>
                      {formatDisplayDate(ev.eventDate, profile?.dateFormat)} •
                      SKU: {ev.sku}
                    </Text>
                    {ev.varianceQuantity !== null ? (
                      <Text style={styles.itemSub}>
                        Count Variance vs Prev Balance: {ev.varianceQuantity}{' '}
                        {ev.unitSymbol}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.qtyText}>
                      {formatQuantity(ev.quantity, ev.unitSymbol)}
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
  modeTab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.slate300,
  },
  modeTabActive: {
    backgroundColor: palette.primary600,
    borderColor: palette.primary600,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.slate700,
  },
  modeTabTextActive: {
    color: palette.white,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.slate900,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.slate600,
    marginBottom: 4,
    marginTop: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.slate300,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    fontSize: 13,
    color: palette.slate900,
    backgroundColor: palette.slate50,
  },
  presetRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  presetChip: {
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.slate300,
    backgroundColor: palette.white,
  },
  presetChipActive: {
    backgroundColor: palette.navy900,
    borderColor: palette.navy900,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: palette.slate700,
  },
  presetChipTextActive: {
    color: palette.white,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  toggleLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: palette.slate700,
  },
  exportRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.slate900,
  },
  daySubtitle: {
    fontSize: 12,
    color: palette.slate500,
    marginTop: 2,
  },
  emptyDayText: {
    fontSize: 12,
    color: palette.slate500,
    fontStyle: 'italic',
    paddingVertical: 6,
  },
  reportItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.sm,
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
    fontSize: 11,
    color: palette.slate500,
    marginTop: 2,
  },
  qtyText: {
    fontSize: 13,
    fontWeight: '800',
    color: palette.slate900,
  },
  consolidatedCard: {
    padding: spacing.md,
    backgroundColor: palette.slate50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.slate200,
  },
  daysBadge: {
    backgroundColor: palette.warning100,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  daysBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: palette.warning700,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: palette.white,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
  },
  statLabel: {
    fontSize: 10,
    color: palette.slate500,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '800',
    color: palette.slate900,
    marginTop: 2,
  },
  linkText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.primary600,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: palette.danger50,
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
    errorText: {
      color: palette.danger700,
      fontSize: 12,
      fontWeight: '600',
    },
  });
}
