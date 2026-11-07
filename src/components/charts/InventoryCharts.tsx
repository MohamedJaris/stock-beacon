import { palette, radius, spacing } from '@/theme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Pure React Native proportional bar chart for Stock Status Overview
 * and Category-wise inventory distribution. Zero browser-only dependencies.
 */
export function StockStatusDistributionBar({
  inStockCount,
  lowStockCount,
  outOfStockCount,
  unknownCount,
}: {
  inStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  unknownCount: number;
}) {
  const styles = getStyles();
  const total = inStockCount + lowStockCount + outOfStockCount + unknownCount;
  if (total === 0) {
    return null;
  }

  const segments = [
    { label: 'In Stock', count: inStockCount, color: palette.success600 },
    { label: 'Low Stock', count: lowStockCount, color: palette.warning600 },
    { label: 'Out of Stock', count: outOfStockCount, color: palette.danger600 },
    { label: 'No Baseline', count: unknownCount, color: palette.slate400 },
  ].filter((s) => s.count > 0);

  return (
    <View style={styles.container}>
      <View style={styles.barTrack}>
        {segments.map((seg) => (
          <View
            key={seg.label}
            style={{
              flex: seg.count / total,
              backgroundColor: seg.color,
              height: '100%',
            }}
          />
        ))}
      </View>
      <View style={styles.legendRow}>
        {segments.map((seg) => (
          <View key={seg.label} style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: seg.color }]}
            />
            <Text style={styles.legendText}>
              {seg.label}: <Text style={styles.legendCount}>{seg.count}</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function CategoryBreakdownChart({
  data,
}: {
  data: {
    categoryName: string;
    colorHex: string;
    itemCount: number;
    lowOrOutCount: number;
  }[];
}) {
  const styles = getStyles();
  const maxCount = Math.max(...data.map((d) => d.itemCount), 1);

  return (
    <View style={{ gap: spacing.sm }}>
      {data.map((cat) => {
        const widthPct = Math.max(Math.round((cat.itemCount / maxCount) * 100), 6);
        return (
          <View key={cat.categoryName} style={styles.catRow}>
            <View style={styles.catHeader}>
              <Text style={styles.catName}>{cat.categoryName}</Text>
              <Text style={styles.catMeta}>
                {cat.itemCount} SKU{cat.itemCount === 1 ? '' : 's'}
                {cat.lowOrOutCount > 0 ? ` • ${cat.lowOrOutCount} Low/Out` : ''}
              </Text>
            </View>
            <View style={styles.catTrack}>
              <View
                style={[
                  styles.catFill,
                  {
                    width: `${widthPct}%`,
                    backgroundColor: cat.colorHex || palette.primary600,
                  },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function getStyles() {
  return StyleSheet.create({
    container: {
      gap: spacing.sm,
    },
  barTrack: {
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: palette.slate100,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: palette.slate600,
  },
  legendCount: {
    fontWeight: '700',
    color: palette.slate900,
  },
  catRow: {
    gap: 4,
  },
  catHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catName: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.slate800,
  },
  catMeta: {
    fontSize: 12,
    color: palette.slate500,
  },
  catTrack: {
    height: 8,
    backgroundColor: palette.slate100,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
    catFill: {
      height: '100%',
      borderRadius: radius.pill,
    },
  });
}
