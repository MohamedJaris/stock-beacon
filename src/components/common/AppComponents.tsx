import { palette, radius, shadows, spacing } from '@/theme';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

export function PrimaryButton({
  title,
  onPress,
  icon,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: keyof typeof Feather.glyphMap;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const bg =
    variant === 'primary'
      ? palette.primary600
      : variant === 'danger'
      ? palette.danger600
      : variant === 'secondary'
      ? palette.navy800
      : palette.white;

  const textColor = variant === 'outline' ? palette.slate800 : '#FFFFFF';
  const borderColor =
    variant === 'outline' ? palette.slate300 : 'transparent';

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.button,
        {
          backgroundColor: disabled ? palette.slate300 : bg,
          borderColor,
          borderWidth: variant === 'outline' ? 1 : 0,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          {icon ? <Feather name={icon} size={17} color={textColor} /> : null}
          <Text style={[styles.buttonText, { color: textColor }]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function SectionCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.white,
          borderColor: palette.slate200,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function EmptyStateView({
  icon = 'inbox',
  title,
  message,
  actionTitle,
  onActionPress,
}: {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  message: string;
  actionTitle?: string;
  onActionPress?: () => void;
}) {
  return (
    <View
      style={[
        styles.emptyContainer,
        {
          backgroundColor: palette.white,
          borderColor: palette.slate200,
        },
      ]}
    >
      <View
        style={[
          styles.emptyIconCircle,
          { backgroundColor: palette.primary50 },
        ]}
      >
        <Feather name={icon} size={28} color={palette.primary600} />
      </View>
      <Text style={[styles.emptyTitle, { color: palette.slate900 }]}>
        {title}
      </Text>
      <Text style={[styles.emptyMessage, { color: palette.slate600 }]}>
        {message}
      </Text>
      {actionTitle && onActionPress ? (
        <PrimaryButton
          title={actionTitle}
          onPress={onActionPress}
          style={{ marginTop: spacing.md }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    gap: spacing.sm,
    minHeight: 46,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  card: {
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.slate200,
    ...shadows.card,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.slate200,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.primary50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.slate900,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  emptyMessage: {
    fontSize: 13,
    color: palette.slate600,
    textAlign: 'center',
    lineHeight: 19,
  },
});
