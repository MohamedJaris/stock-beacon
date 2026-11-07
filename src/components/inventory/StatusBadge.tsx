import { QuantityProvenance, StockStatus } from '@/domain/enums';
import { palette, radius, spacing } from '@/theme';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function StockStatusBadge({
  status,
  size = 'md',
}: {
  status: StockStatus;
  size?: 'sm' | 'md';
}) {
  const config = getStatusConfig(status);
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: config.bg,
          borderColor: config.border,
          paddingVertical: size === 'sm' ? 2 : 4,
          paddingHorizontal: size === 'sm' ? 7 : 10,
        },
      ]}
    >
      <Feather
        name={config.icon}
        size={size === 'sm' ? 11 : 13}
        color={config.text}
      />
      <Text
        style={[
          styles.badgeText,
          { color: config.text, fontSize: size === 'sm' ? 11 : 12 },
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
}

export function ProvenanceBadge({
  provenance,
  size = 'sm',
}: {
  provenance: QuantityProvenance;
  size?: 'sm' | 'md';
}) {
  const config = getProvenanceConfig(provenance);
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: config.bg,
          borderColor: config.border,
          paddingVertical: size === 'sm' ? 2 : 4,
          paddingHorizontal: size === 'sm' ? 6 : 9,
        },
      ]}
    >
      <Feather
        name={config.icon}
        size={size === 'sm' ? 10 : 12}
        color={config.text}
      />
      <Text
        style={[
          styles.badgeText,
          { color: config.text, fontSize: size === 'sm' ? 10 : 11 },
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
}

function getStatusConfig(status: StockStatus): {
  label: string;
  bg: string;
  border: string;
  text: string;
  icon: keyof typeof Feather.glyphMap;
} {
  switch (status) {
    case 'IN_STOCK':
      return {
        label: 'In Stock',
        bg: palette.success50,
        border: palette.success100,
        text: palette.success700,
        icon: 'check-circle',
      };
    case 'LOW_STOCK':
      return {
        label: 'Low Stock',
        bg: palette.warning50,
        border: palette.warning100,
        text: palette.warning700,
        icon: 'alert-triangle',
      };
    case 'OUT_OF_STOCK':
      return {
        label: 'Out of Stock',
        bg: palette.danger50,
        border: palette.danger100,
        text: palette.danger700,
        icon: 'x-circle',
      };
    case 'UNKNOWN':
    default:
      return {
        label: 'No Baseline',
        bg: palette.slate100,
        border: palette.slate300,
        text: palette.slate600,
        icon: 'help-circle',
      };
  }
}

function getProvenanceConfig(provenance: QuantityProvenance): {
  label: string;
  bg: string;
  border: string;
  text: string;
  icon: keyof typeof Feather.glyphMap;
} {
  switch (provenance) {
    case 'PHYSICAL_COUNT':
      return {
        label: 'Verified Physical Count',
        bg: palette.indigo50,
        border: palette.indigo100,
        text: palette.indigo700,
        icon: 'clipboard',
      };
    case 'CALCULATED_INWARD_ONLY':
      return {
        label: 'Inward-Only Balance',
        bg: palette.sky50,
        border: palette.sky100,
        text: palette.sky700,
        icon: 'arrow-down-circle',
      };
    case 'CARRIED_FORWARD':
      return {
        label: 'Carried Forward',
        bg: palette.slate100,
        border: palette.slate200,
        text: palette.slate600,
        icon: 'clock',
      };
    case 'UNKNOWN':
    default:
      return {
        label: 'Unverified Baseline',
        bg: palette.slate100,
        border: palette.slate200,
        text: palette.slate500,
        icon: 'minus-circle',
      };
  }
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    gap: spacing.xs,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontWeight: '600',
  },
});
