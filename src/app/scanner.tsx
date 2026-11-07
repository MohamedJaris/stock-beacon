import {
  PrimaryButton,
  SectionCard,
} from '@/components/common/AppComponents';
import {
  ProvenanceBadge,
  StockStatusBadge,
} from '@/components/inventory/StatusBadge';
import { formatQuantity } from '@/core/utils/quantityMath';
import { useAppStore } from '@/stores/useAppStore';
import { palette, radius, spacing } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function BarcodeScannerScreen() {
  const styles = getStyles();
  const router = useRouter();
  const inventoryItems = useAppStore((s) => s.inventoryItems);
  const isDarkMode = useAppStore((s) => s.isDarkMode);

  const [permission, requestPermission] = useCameraPermissions();
  const [scannedCode, setScannedCode] = useState<string>('');
  const [manualInput, setManualInput] = useState<string>('');

  const activeCode = scannedCode.trim() || manualInput.trim();
  const matchedItem = activeCode
    ? inventoryItems.find(
        (i) =>
          i.barcode?.toLowerCase() === activeCode.toLowerCase() ||
          i.sku.toLowerCase() === activeCode.toLowerCase()
      )
    : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
    >
      <SectionCard style={styles.section}>
        <Text style={styles.title}>Offline Camera Barcode Scanner</Text>
        <Text style={styles.subtitle}>
          Supports EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, and QR Codes offline.
        </Text>

        {!permission ? (
          <View style={styles.cameraPlaceholder}>
            <Text style={styles.subtitle}>Checking camera permissions...</Text>
          </View>
        ) : !permission.granted ? (
          <View style={styles.cameraPlaceholder}>
            <Feather name="camera-off" size={28} color={palette.slate400} />
            <Text style={[styles.subtitle, { textAlign: 'center' }]}>
              Camera permission is required to scan product barcodes directly.
              You can also enter or paste a barcode manually below.
            </Text>
            <PrimaryButton
              title="Grant Camera Permission"
              icon="camera"
              onPress={requestPermission}
              style={{ marginTop: spacing.sm }}
            />
          </View>
        ) : (
          <View style={styles.cameraContainer}>
            <CameraView
              style={styles.cameraView}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: [
                  'ean13',
                  'ean8',
                  'upc_a',
                  'upc_e',
                  'code128',
                  'code39',
                  'qr',
                ],
              }}
              onBarcodeScanned={(result) => {
                if (result.data && result.data !== scannedCode) {
                  setScannedCode(result.data);
                }
              }}
            />
          </View>
        )}

        <Text style={styles.label}>
          Or Enter / Lookup Barcode or SKU Manually
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Scan or type barcode / SKU..."
          value={scannedCode || manualInput}
          onChangeText={(txt) => {
            setScannedCode('');
            setManualInput(txt);
          }}
        />
      </SectionCard>

      {activeCode ? (
        <SectionCard style={styles.section}>
          <Text style={styles.title}>Lookup Result for "{activeCode}"</Text>

          {matchedItem ? (
            <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{matchedItem.displayName}</Text>
                  <Text style={styles.subtitle}>
                    SKU: {matchedItem.sku} • Category: {matchedItem.categoryName}
                  </Text>
                </View>
                <StockStatusBadge status={matchedItem.stockStatus} size="sm" />
              </View>

              <View style={styles.rowBetween}>
                <ProvenanceBadge provenance={matchedItem.quantityProvenance} />
                <Text style={styles.qtyText}>
                  Balance:{' '}
                  {formatQuantity(
                    matchedItem.recordedQuantity,
                    matchedItem.unitSymbol
                  )}
                </Text>
              </View>

              <View style={styles.actionsCol}>
                <PrimaryButton
                  title="Record Stock Inward for This Item"
                  icon="arrow-down-left"
                  onPress={() =>
                    router.replace({
                      pathname: '/(tabs)/stock',
                      params: { tab: 'inward', itemKey: matchedItem.itemKey },
                    })
                  }
                />
                <PrimaryButton
                  title="Record Physical Count for This Item"
                  variant="secondary"
                  icon="check-square"
                  onPress={() =>
                    router.replace({
                      pathname: '/(tabs)/stock',
                      params: { tab: 'count', itemKey: matchedItem.itemKey },
                    })
                  }
                />
                <PrimaryButton
                  title="Open Product Details & History"
                  variant="outline"
                  icon="external-link"
                  onPress={() =>
                    router.replace(`/product/${matchedItem.productId}`)
                  }
                />
              </View>
            </View>
          ) : (
            <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
              <Text style={styles.subtitle}>
                No existing product or variant matches barcode "{activeCode}".
              </Text>
              <PrimaryButton
                title={`Create New Product with Barcode "${activeCode}"`}
                icon="plus-circle"
                onPress={() =>
                  router.replace({
                    pathname: '/product/new',
                    params: { barcode: activeCode },
                  })
                }
              />
            </View>
          )}
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
    paddingBottom: 36,
  },
  section: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.slate900,
  },
  subtitle: {
    fontSize: 12,
    color: palette.slate500,
    marginTop: 2,
  },
  cameraPlaceholder: {
    marginTop: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: palette.slate100,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  cameraContainer: {
    marginTop: spacing.md,
    height: 220,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: palette.navy900,
  },
  cameraView: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.slate700,
    marginTop: spacing.md,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.slate300,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: palette.slate900,
    backgroundColor: palette.slate50,
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
  qtyText: {
    fontSize: 14,
    fontWeight: '800',
    color: palette.slate900,
  },
    actionsCol: {
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
  });
}
