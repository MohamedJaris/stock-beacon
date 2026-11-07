import { useAppStore } from '@/stores/useAppStore';
import { palette } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { TouchableOpacity } from 'react-native';

export default function TabsLayout() {
  const inventoryItems = useAppStore((s) => s.inventoryItems);
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const toggleLightDark = useAppStore((s) => s.toggleLightDark);

  const lowOrOutCount = inventoryItems.filter(
    (i) => i.stockStatus === 'LOW_STOCK' || i.stockStatus === 'OUT_OF_STOCK'
  ).length;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: palette.primary600,
        tabBarInactiveTintColor: palette.slate500,
        tabBarStyle: {
          backgroundColor: palette.white,
          borderTopColor: palette.slate200,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: palette.white,
        },
        headerTintColor: palette.slate900,
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 17,
        },
        headerRight: () => (
          <TouchableOpacity
            onPress={toggleLightDark}
            style={{
              marginRight: 16,
              padding: 8,
              borderRadius: 10,
              backgroundColor: palette.slate100,
              borderWidth: 1,
              borderColor: palette.slate200,
            }}
            accessibilityLabel="Toggle Light and Dark Mode"
          >
            <Feather
              name={isDarkMode ? 'sun' : 'moon'}
              size={18}
              color={isDarkMode ? '#FBBF24' : palette.slate800}
            />
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
          tabBarBadge: lowOrOutCount > 0 ? lowOrOutCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: palette.warning600,
            color: '#FFFFFF',
            fontSize: 10,
          },
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Products',
          headerTitle: 'Products & Catalog',
          tabBarIcon: ({ color, size }) => (
            <Feather name="package" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: 'Stock',
          headerTitle: 'Stock Operations & Ledger',
          tabBarIcon: ({ color, size }) => (
            <Feather name="layers" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          headerTitle: 'Historical & Low-Stock Reports',
          tabBarIcon: ({ color, size }) => (
            <Feather name="bar-chart-2" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          headerTitle: 'Workspace, Backup & Settings',
          tabBarIcon: ({ color, size }) => (
            <Feather name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
