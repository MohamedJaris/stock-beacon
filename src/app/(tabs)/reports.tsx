import {
  buildConsolidatedLowStockCsv,
  buildCurrentInventoryCsv,
  buildDailyLowStockCsv,
  buildHtmlReportForPdf,
  exportAndShareReportFile,
  formatProvenanceLabel,
  formatStockStatusLabel,
} from '@/application/services/ReportExportService';
import {
  EmptyStateView,
  SectionCard,
} from '@/components/common/AppComponents';
import { StockStatusBadge } from '@/components/inventory/StatusBadge';
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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type ReportMode =
  | 'daily_low_stock'
  | 'consolidated_low_stock'
  | 'current_inventory';

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
  const [presetDays, setPresetDays] = useState<number | 'custom'>(4);
  const [startDate, setStartDate] = useState(addDays(today, -4));
  const [endDate, setEndDate] = useState(today);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );

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
      setDateError('Enter valid dates in YYYY-MM-DD format.');
      return;
    }
    if (startDate > endDate) {
      setDateError('Start date cannot be after end date.');
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
          searchQuery: '',
          includeAllStatuses: false,
        }),
        invRepo.getConsolidatedLowStockReport({
          workspaceId: profile.id,
          startDate,
          endDate,
          categoryId: selectedCategoryId,
          searchQuery: '',
        }),
      ]);

      setDailyReport(daily);
      setConsolidatedReport(consolidated);

      const initialExpanded: Record<string, boolean> = {};
      for (const d of daily.days) {
        initialExpanded[d.date] = true;
      }
      setExpandedDates(initialExpanded);
    } catch (err) {
      setDateError((err as Error).message);
    }
  }, [profile, startDate, endDate, selectedCategoryId]);

  useEffect(() => {
    runHistoricalQuery();
  }, [runHistoricalQuery, inventoryItems, recentEvents]);

  const applyDatePreset = (daysBack: number) => {
    setPresetDays(daysBack);
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
        reportTitle: 'Daily Low-Stock Report',
        dateRangeLabel: `${startDate} to ${endDate}`,
        headers: [
          'Date',
          'Product',
          'SKU',
          'Quantity',
          'Minimum',
          'Status',
          'Source',
        ],
        rows,
      });
      await exportAndShareReportFile({
        format,
        fileNamePrefix: 'daily_low_stock',
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
        dateRangeLabel: `${startDate} to ${endDate}`,
        headers: [
          'Product',
          'SKU',
          'Category',
          'Minimum',
          'Lowest Qty',
          'Low Days',
          'Out Days',
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
        fileNamePrefix: 'consolidated_low_stock',
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
        reportTitle: 'Current Inventory Report',
        dateRangeLabel: `As of ${today}`,
        headers: [
          'Product',
          'SKU',
          'Category',
          'Stock',
          'Minimum',
          'Status',
          'Source',
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
        fileNamePrefix: 'current_inventory',
        csvContent: csv,
        htmlContent: html,
      });
    }
  };

  return (
    <View style={styles.screen}>
      {/* Clean 3-Tab Segmented Bar */}
      <View style={styles.tabBar}>
        {(
          [
            { key: 'daily_low_stock', label: 'Daily Low' },
            { key: 'consolidated_low_stock', label: 'Summary' },
            { key: 'current_inventory', label: 'All Stock' },
          ] as { key: ReportMode; label: string }[]
        ).map((m) => {
          const active = reportMode === m.key;
          return (
            <TouchableOpacity
              key={m.key}
              onPress={() => setReportMode(m.key)}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
            >
              <Text
                style={[styles.tabText, active && styles.tabTextActive]}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Compact Filter & Export Bar */}
        <View style={styles.filterCard}>
          {reportMode !== 'current_inventory' ? (
            <>
              <View style={styles.rowBetween}>
                <View style={styles.presetRow}>
                  {[
                    { days: 0, label: 'Today' },
                    { days: 4, label: '5 Days' },
                    { days: 6, label: '7 Days' },
                    { days: 29, label: '30 Days' },
                  ].map((p) => {
                    const active = presetDays === p.days;
                    return (
                      <TouchableOpacity
                        key={p.label}
                        style={[
                          styles.presetChip,
                          active && styles.presetChipActive,
                        ]}
                        onPress={() => applyDatePreset(p.days)}
                      >
                        <Text
                          style={[
                            styles.presetChipText,
                            active && styles.presetChipTextActive,
                          ]}
                        >
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    style={[
                      styles.presetChip,
                      presetDays === 'custom' && styles.presetChipActive,
                    ]}
                    onPress={() => setPresetDays('custom')}
                  >
                    <Text
                      style={[
                        styles.presetChipText,
                        presetDays === 'custom' && styles.presetChipTextActive,
                      ]}
                    >
                      Custom
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {presetDays === 'custom' ? (
                <View style={[styles.row, { marginTop: spacing.sm }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>From</Text>
                    <TextInput
                      style={styles.input}
                      value={startDate}
                      onChangeText={setStartDate}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>To</Text>
                    <TextInput
                      style={styles.input}
                      value={endDate}
                      onChangeText={setEndDate}
                    />
                  </View>
                </View>
              ) : null}

              {dateError ? (
                <Text style={styles.errorText}>{dateError}</Text>
              ) : null}
            </>
          ) : null}

          <View style={styles.categoryAndExportRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={{ gap: 6 }}
            >
              <TouchableOpacity
                onPress={() => setSelectedCategoryId(null)}
                style={[
                  styles.catChip,
                  !selectedCategoryId && styles.catChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.catChipText,
                    !selectedCategoryId && styles.catChipTextActive,
                  ]}
                >
                  All Categories
                </Text>
              </TouchableOpacity>
              {categories.map((c) => {
                const active = selectedCategoryId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() =>
                      setSelectedCategoryId(active ? null : c.id)
                    }
                    style={[styles.catChip, active && styles.catChipActive]}
                  >
                    <Text
                      style={[
                        styles.catChipText,
                        active && styles.catChipTextActive,
                      ]}
                    >
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 6, marginLeft: 8 }}>
              <TouchableOpacity
                style={styles.exportChip}
                onPress={() => handleExport('csv')}
              >
                <Feather name="download" size={13} color={palette.primary600} />
                <Text style={styles.exportChipText}>CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.exportChip}
                onPress={() => handleExport('pdf')}
              >
                <Feather name="file-text" size={13} color={palette.primary600} />
                <Text style={styles.exportChipText}>PDF</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ================================================================
            TAB 1: DAILY LOW-STOCK HISTORY
           ================================================================ */}
        {reportMode === 'daily_low_stock' && dailyReport ? (
          <View style={{ gap: spacing.sm }}>
            {dailyReport.days.map((dayGroup) => {
              const isOpen = Boolean(expandedDates[dayGroup.date]);
              return (
                <SectionCard key={dayGroup.date}>
                  <TouchableOpacity
                    style={styles.dayHeaderRow}
                    onPress={() =>
                      setExpandedDates((prev) => ({
                        ...prev,
                        [dayGroup.date]: !prev[dayGroup.date],
                      }))
                    }
                  >
                    <View>
                      <Text style={styles.dayTitle}>
                        {formatReadableDate(dayGroup.date)}
                      </Text>
                      <Text style={styles.daySubtitle}>
                        {dayGroup.lowStockCount} Low • {dayGroup.outOfStockCount}{' '}
                        Out of Stock
                      </Text>
                    </View>
                    <Feather
                      name={isOpen ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={palette.slate600}
                    />
                  </TouchableOpacity>

                  {isOpen ? (
                    dayGroup.items.length === 0 ? (
                      <Text style={styles.emptyDayNote}>
                        All items were above minimum stock on this date.
                      </Text>
                    ) : (
                      <View style={{ gap: 6, marginTop: spacing.sm }}>
                        {dayGroup.items.map((item) => (
                          <TouchableOpacity
                            key={`${dayGroup.date}_${item.itemKey}`}
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
                                {item.categoryName} • Min:{' '}
                                {formatQuantity(
                                  item.minStockThreshold,
                                  item.unitSymbol
                                )}
                              </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end', gap: 4 }}>
                              <Text style={styles.qtyBold}>
                                {formatQuantity(
                                  item.recordedQuantity,
                                  item.unitSymbol
                                )}
                              </Text>
                              <StockStatusBadge
                                status={item.stockStatus}
                                size="sm"
                              />
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )
                  ) : null}
                </SectionCard>
              );
            })}
          </View>
        ) : null}

        {/* ================================================================
            TAB 2: CONSOLIDATED LOW-STOCK SUMMARY
           ================================================================ */}
        {reportMode === 'consolidated_low_stock' && consolidatedReport ? (
          <SectionCard>
            {consolidatedReport.items.length === 0 ? (
              <EmptyStateView
                icon="check-circle"
                title="No Low-Stock Items"
                message="No items fell below minimum stock during this period."
              />
            ) : (
              <View style={{ gap: 8 }}>
                {consolidatedReport.items.map((item) => (
                  <TouchableOpacity
                    key={item.itemKey}
                    style={styles.reportItemRow}
                    onPress={() => router.push(`/product/${item.productId}`)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{item.displayName}</Text>
                      <Text style={styles.itemSub}>
                        {item.categoryName} • Lowest:{' '}
                        <Text style={styles.qtyBold}>
                          {formatQuantity(
                            item.lowestRecordedQuantity,
                            item.unitSymbol
                          )}
                        </Text>{' '}
                        (Min:{' '}
                        {formatQuantity(
                          item.applicableThreshold,
                          item.unitSymbol
                        )}
                        )
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text
                        style={[
                          styles.qtyBold,
                          {
                            color:
                              item.outOfStockDays > 0
                                ? palette.danger600
                                : palette.warning600,
                          },
                        ]}
                      >
                        {item.lowStockDays + item.outOfStockDays} days low
                      </Text>
                      <Text style={styles.itemSub}>
                        {formatDisplayDate(
                          item.lastLowStockDate,
                          profile?.dateFormat
                        )}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </SectionCard>
        ) : null}

        {/* ================================================================
            TAB 3: CURRENT INVENTORY
           ================================================================ */}
        {reportMode === 'current_inventory' ? (
          <SectionCard>
            <View style={{ gap: 8 }}>
              {inventoryItems
                .filter(
                  (i) =>
                    !selectedCategoryId || i.categoryId === selectedCategoryId
                )
                .map((item) => (
                  <TouchableOpacity
                    key={item.itemKey}
                    style={styles.reportItemRow}
                    onPress={() => router.push(`/product/${item.productId}`)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{item.displayName}</Text>
                      <Text style={styles.itemSub}>
                        {item.categoryName} • Min:{' '}
                        {formatQuantity(
                          item.minStockThreshold,
                          item.unitSymbol
                        )}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={styles.qtyBold}>
                        {formatQuantity(item.recordedQuantity, item.unitSymbol)}
                      </Text>
                      <StockStatusBadge status={item.stockStatus} size="sm" />
                    </View>
                  </TouchableOpacity>
                ))}
            </View>
          </SectionCard>
        ) : null}
      </ScrollView>
    </View>
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
    filterCard: {
      backgroundColor: palette.white,
      borderRadius: radius.md,
      padding: spacing.sm,
      borderWidth: 1,
      borderColor: palette.slate200,
      marginBottom: spacing.md,
    },
    rowBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    presetRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    presetChip: {
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: radius.pill,
      backgroundColor: palette.slate100,
    },
    presetChipActive: {
      backgroundColor: palette.primary600,
    },
    presetChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: palette.slate700,
    },
    presetChipTextActive: {
      color: '#FFFFFF',
    },
    label: {
      fontSize: 11,
      fontWeight: '600',
      color: palette.slate600,
      marginBottom: 2,
    },
    input: {
      borderWidth: 1,
      borderColor: palette.slate300,
      borderRadius: radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontSize: 13,
      color: palette.slate900,
      backgroundColor: palette.slate50,
    },
    errorText: {
      fontSize: 12,
      fontWeight: '600',
      color: palette.danger600,
      marginTop: 6,
    },
    categoryAndExportRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: palette.slate100,
    },
    catChip: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: radius.pill,
      backgroundColor: palette.slate50,
      borderWidth: 1,
      borderColor: palette.slate200,
    },
    catChipActive: {
      backgroundColor: palette.navy900,
      borderColor: palette.navy900,
    },
    catChipText: {
      fontSize: 11,
      fontWeight: '700',
      color: palette.slate600,
    },
    catChipTextActive: {
      color: palette.white,
    },
    exportChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 5,
      paddingHorizontal: 9,
      borderRadius: radius.sm,
      backgroundColor: palette.primary50,
      borderWidth: 1,
      borderColor: palette.primary100,
    },
    exportChipText: {
      fontSize: 11,
      fontWeight: '700',
      color: palette.primary600,
    },
    dayHeaderRow: {
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
    emptyDayNote: {
      fontSize: 12,
      color: palette.slate500,
      fontStyle: 'italic',
      marginTop: spacing.sm,
    },
    reportItemRow: {
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
    qtyBold: {
      fontSize: 14,
      fontWeight: '800',
      color: palette.slate900,
    },
  });
}
