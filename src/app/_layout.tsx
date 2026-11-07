import { useAppStore } from '@/stores/useAppStore';
import { palette } from '@/theme';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export default function RootLayout() {
  const { isInitialized, profile, isDarkMode, themeMode, initializeApp } =
    useAppStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  useEffect(() => {
    if (!isInitialized) return;
    const inOnboarding = segments[0] === 'onboarding';
    if (!profile && !inOnboarding) {
      router.replace('/onboarding');
    } else if (profile && inOnboarding) {
      router.replace('/(tabs)');
    }
  }, [isInitialized, profile, segments, router]);

  if (!isInitialized) {
    return (
      <View style={styles.loadingScreen}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={palette.primary500} />
        <Text style={styles.loadingTitle}>StockBeacon</Text>
        <Text style={styles.loadingSubtitle}>
          Initializing Offline SQLite Inventory Engine...
        </Text>
      </View>
    );
  }

  return (
    <View
      key={`theme-${themeMode}-${isDarkMode ? 'dark' : 'light'}`}
      style={{ flex: 1, backgroundColor: palette.slate50 }}
    >
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.white },
          headerTintColor: palette.slate900,
          headerTitleStyle: { fontWeight: '700', fontSize: 17 },
          contentStyle: { backgroundColor: palette.slate50 },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="onboarding"
          options={{ headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen
          name="low-stock"
          options={{ title: 'Low-Stock & Out-of-Stock Register' }}
        />
        <Stack.Screen
          name="scanner"
          options={{ title: 'Barcode Scanner', presentation: 'modal' }}
        />
        <Stack.Screen
          name="notifications"
          options={{ title: 'Alerts & Notifications' }}
        />
        <Stack.Screen
          name="suppliers"
          options={{ title: 'Suppliers Directory' }}
        />
        <Stack.Screen
          name="product/new"
          options={{ title: 'Add New Product' }}
        />
        <Stack.Screen
          name="product/[id]"
          options={{ title: 'Product & Stock History' }}
        />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingTitle: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  loadingSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#94A3B8',
  },
});
