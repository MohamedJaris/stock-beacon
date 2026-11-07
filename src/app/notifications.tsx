import {
  EmptyStateView,
  PrimaryButton,
  SectionCard,
} from '@/components/common/AppComponents';
import { useAppStore } from '@/stores/useAppStore';
import { palette, radius, spacing } from '@/theme';
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

export default function NotificationsScreen() {
  const styles = getStyles();
  const router = useRouter();
  const notifications = useAppStore((s) => s.notifications);
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const markAllNotificationsRead = useAppStore(
    (s) => s.markAllNotificationsRead
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>
          Alert History ({notifications.length})
        </Text>
        {notifications.some((n) => !n.isRead) ? (
          <PrimaryButton
            title="Mark All Read"
            variant="outline"
            onPress={markAllNotificationsRead}
          />
        ) : null}
      </View>

      {notifications.length === 0 ? (
        <EmptyStateView
          icon="bell"
          title="No Alerts Generated Yet"
          message="StockBeacon automatically generates state-transition alerts whenever a product enters Low-Stock or Out-of-Stock status."
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {notifications.map((n) => {
            const isOut = n.notificationType === 'OUT_OF_STOCK_ALERT';
            return (
              <TouchableOpacity
                key={n.id}
                onPress={() => {
                  if (n.productId) {
                    router.push(`/product/${n.productId}`);
                  }
                }}
              >
                <SectionCard
                  style={!n.isRead ? styles.unreadCard : undefined}
                >
                  <View style={styles.row}>
                    <Feather
                      name={isOut ? 'x-circle' : 'alert-triangle'}
                      size={18}
                      color={isOut ? palette.danger600 : palette.warning600}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.notifTitle}>{n.title}</Text>
                      <Text style={styles.notifMessage}>{n.message}</Text>
                      <Text style={styles.notifTime}>
                        {new Date(n.createdAt).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </SectionCard>
              </TouchableOpacity>
            );
          })}
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: palette.slate900,
  },
  unreadCard: {
    borderColor: palette.primary500,
    backgroundColor: palette.primary50,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.slate900,
  },
  notifMessage: {
    fontSize: 12,
    color: palette.slate700,
    marginTop: 2,
    lineHeight: 18,
  },
    notifTime: {
      fontSize: 11,
      color: palette.slate500,
      marginTop: 4,
    },
  });
}
