import {
  BackupRestoreService,
  BackupValidationResult,
} from '@/application/services/BackupRestoreService';
import {
  PrimaryButton,
  SecondaryButton,
  SectionCard,
} from '@/components/common/AppComponents';
import { getDatabase } from '@/data/database/DatabaseConnection';
import { DateFormatOption } from '@/domain/enums';
import { useAppStore } from '@/stores/useAppStore';
import { palette, radius, spacing, ThemeMode } from '@/theme';
import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function SettingsScreen() {
  const styles = getStyles();
  const profile = useAppStore((s) => s.profile);
  const themeMode = useAppStore((s) => s.themeMode);
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const setThemeMode = useAppStore((s) => s.setThemeMode);
  const updateBusinessProfile = useAppStore((s) => s.updateBusinessProfile);
  const createBackupJson = useAppStore((s) => s.createBackupJson);
  const restoreBackupJson = useAppStore((s) => s.restoreBackupJson);

  const [businessName, setBusinessName] = useState(
    profile?.businessName || ''
  );
  const [businessType, setBusinessType] = useState(
    profile?.businessType || ''
  );
  const [ownerName, setOwnerName] = useState(profile?.ownerName || '');
  const [contactNumber, setContactNumber] = useState(
    profile?.contactNumber || ''
  );
  const [dateFormat, setDateFormat] = useState<DateFormatOption>(
    profile?.dateFormat || 'DD/MM/YYYY'
  );

  // Backup / Restore states
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreJsonInput, setRestoreJsonInput] = useState('');
  const [validationPreview, setValidationPreview] =
    useState<BackupValidationResult | null>(null);

  const handleSaveProfile = async () => {
    setStatusMessage(null);
    if (!businessName.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Shop name cannot be empty.',
      });
      return;
    }
    await updateBusinessProfile({
      businessName: businessName.trim(),
      businessType: businessType.trim(),
      ownerName: ownerName.trim() || null,
      contactNumber: contactNumber.trim() || null,
      dateFormat,
    });
    setStatusMessage({
      type: 'success',
      text: 'Shop profile saved.',
    });
  };

  const handleExportBackupFile = async () => {
    setStatusMessage(null);
    try {
      const jsonStr = await createBackupJson();
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `stockbeacon_backup_${ts}.json`;

      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const url = `data:application/json;charset=utf-8,${encodeURIComponent(
          jsonStr
        )}`;
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setStatusMessage({
          type: 'success',
          text: `Backup downloaded (${fileName}).`,
        });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const FileSystem = require('expo-file-system');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Sharing = require('expo-sharing');

      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, jsonStr, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Save StockBeacon Backup',
        });
      }
      setStatusMessage({
        type: 'success',
        text: 'Backup exported.',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: `Backup failed: ${(err as Error).message}`,
      });
    }
  };

  const handlePickBackupDocument = async () => {
    setStatusMessage(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const DocumentPicker = require('expo-document-picker');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const FileSystem = require('expo-file-system');

      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) {
        return;
      }

      const asset = res.assets[0];
      const content = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      setRestoreJsonInput(content);
      const db = await getDatabase();
      const svc = new BackupRestoreService(db);
      const val = svc.validateBackupJson(content);
      setValidationPreview(val);
      setShowRestoreModal(true);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: `Could not read backup file: ${(err as Error).message}`,
      });
    }
  };

  const handleConfirmRestore = async () => {
    try {
      await createBackupJson();
      await restoreBackupJson(restoreJsonInput);
      setShowRestoreModal(false);
      setRestoreJsonInput('');
      setValidationPreview(null);
      setStatusMessage({
        type: 'success',
        text: 'Backup restored.',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: `Restore failed: ${(err as Error).message}`,
      });
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
    >
      {statusMessage ? (
        <View
          style={[
            styles.banner,
            statusMessage.type === 'success'
              ? styles.bannerSuccess
              : styles.bannerError,
          ]}
        >
          <Feather
            name={
              statusMessage.type === 'success' ? 'check-circle' : 'alert-circle'
            }
            size={16}
            color={
              statusMessage.type === 'success'
                ? palette.success700
                : palette.danger700
            }
          />
          <Text
            style={[
              styles.bannerText,
              {
                color:
                  statusMessage.type === 'success'
                    ? palette.success700
                    : palette.danger700,
              },
            ]}
          >
            {statusMessage.text}
          </Text>
        </View>
      ) : null}

      {/* 1. Theme Mode */}
      <SectionCard style={styles.section}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <View style={[styles.row, { marginTop: spacing.sm }]}>
          {(
            [
              { key: 'light', label: 'Light', icon: 'sun' },
              { key: 'dark', label: 'Dark', icon: 'moon' },
              { key: 'system', label: 'Auto', icon: 'smartphone' },
            ] as {
              key: ThemeMode;
              label: string;
              icon: keyof typeof Feather.glyphMap;
            }[]
          ).map((opt) => {
            const active = themeMode === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setThemeMode(opt.key)}
                style={[styles.fmtChip, active && styles.fmtChipActive]}
              >
                <Feather
                  name={opt.icon}
                  size={14}
                  color={active ? '#FFFFFF' : palette.slate700}
                />
                <Text
                  style={[styles.fmtText, active && styles.fmtTextActive]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SectionCard>

      {/* 2. Shop Profile */}
      <SectionCard style={styles.section}>
        <Text style={styles.sectionTitle}>Shop Details</Text>

        <Text style={styles.label}>Shop Name *</Text>
        <TextInput
          style={styles.input}
          value={businessName}
          onChangeText={setBusinessName}
        />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Owner Name</Text>
            <TextInput
              style={styles.input}
              value={ownerName}
              onChangeText={setOwnerName}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Phone</Text>
            <TextInput
              style={styles.input}
              value={contactNumber}
              onChangeText={setContactNumber}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        <PrimaryButton
          title="Save Shop Details"
          icon="save"
          onPress={handleSaveProfile}
          style={{ marginTop: spacing.md }}
        />
      </SectionCard>

      {/* 3. Backup & Restore */}
      <SectionCard style={styles.section}>
        <Text style={styles.sectionTitle}>Backup & Restore</Text>
        <Text style={styles.subText}>
          Save a backup of your products and stock to your phone, or restore from a saved backup file.
        </Text>

        <View style={[styles.row, { marginTop: spacing.md }]}>
          <PrimaryButton
            title="Export Backup"
            icon="download"
            onPress={handleExportBackupFile}
            style={{ flex: 1 }}
          />
          <SecondaryButton
            title="Restore File"
            icon="upload"
            onPress={handlePickBackupDocument}
            style={{ flex: 1 }}
          />
        </View>
      </SectionCard>

      {/* Restore Confirmation Modal */}
      <Modal visible={showRestoreModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Restore Backup</Text>

            {validationPreview ? (
              <View
                style={[
                  styles.previewBox,
                  {
                    backgroundColor: validationPreview.valid
                      ? palette.success50
                      : palette.danger50,
                  },
                ]}
              >
                <Text style={{ fontWeight: '700', color: palette.slate900 }}>
                  {validationPreview.valid
                    ? `Valid Backup (${validationPreview.productCount} products, ${validationPreview.stockEventCount} entries)`
                    : `Invalid File: ${validationPreview.error}`}
                </Text>
              </View>
            ) : null}

            <View style={[styles.row, { marginTop: spacing.lg }]}>
              <SecondaryButton
                title="Cancel"
                onPress={() => setShowRestoreModal(false)}
                style={{ flex: 1 }}
              />
              {validationPreview?.valid ? (
                <PrimaryButton
                  title="Restore Now"
                  variant="danger"
                  onPress={handleConfirmRestore}
                  style={{ flex: 1 }}
                />
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
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
      padding: spacing.md,
      paddingBottom: 40,
    },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      marginBottom: spacing.md,
    },
    bannerSuccess: {
      backgroundColor: palette.success50,
      borderColor: palette.success100,
    },
    bannerError: {
      backgroundColor: palette.danger50,
      borderColor: palette.danger100,
    },
    bannerText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
    },
    section: {
      marginBottom: spacing.md,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: palette.slate900,
    },
    subText: {
      fontSize: 12,
      color: palette.slate500,
      marginTop: 4,
    },
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
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
    fmtChip: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: palette.slate200,
      backgroundColor: palette.slate100,
      alignItems: 'center',
    },
    fmtChipActive: {
      backgroundColor: palette.primary600,
      borderColor: palette.primary600,
    },
    fmtText: {
      fontSize: 13,
      fontWeight: '700',
      color: palette.slate700,
    },
    fmtTextActive: {
      color: '#FFFFFF',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.55)',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    modalCard: {
      backgroundColor: palette.white,
      borderRadius: radius.lg,
      padding: spacing.xl,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: palette.slate900,
    },
    previewBox: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
    },
  });
}
