import {
  BackupRestoreService,
  BackupValidationResult,
} from '@/application/services/BackupRestoreService';
import {
  PrimaryButton,
  SectionCard,
} from '@/components/common/AppComponents';
import { getDatabase } from '@/data/database/DatabaseConnection';
import { DateFormatOption } from '@/domain/enums';
import { useAppStore } from '@/stores/useAppStore';
import { palette, radius, spacing, ThemeMode } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function SettingsScreen() {
  const styles = getStyles();
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const themeMode = useAppStore((s) => s.themeMode);
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const setThemeMode = useAppStore((s) => s.setThemeMode);
  const suppliers = useAppStore((s) => s.suppliers);
  const notificationSettings = useAppStore((s) => s.notificationSettings);
  const updateBusinessProfile = useAppStore((s) => s.updateBusinessProfile);
  const updateNotificationSettings = useAppStore(
    (s) => s.updateNotificationSettings
  );
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
  const [reminderTime, setReminderTime] = useState(
    notificationSettings?.dailyReminderTime || '20:00'
  );
  const [summaryTime, setSummaryTime] = useState(
    notificationSettings?.dailySummaryTime || '09:00'
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
        text: 'Business name cannot be empty.',
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
      text: 'Business profile settings updated.',
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
          text: `Backup downloaded to your laptop (${fileName}).`,
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
          dialogTitle: 'Save or Share StockBeacon Versioned Backup',
        });
      }
      setStatusMessage({
        type: 'success',
        text: `Backup created and ready to save externally (${fileUri}).`,
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

  const handleValidateManualJson = async () => {
    const db = await getDatabase();
    const svc = new BackupRestoreService(db);
    const val = svc.validateBackupJson(restoreJsonInput);
    setValidationPreview(val);
  };

  const handleConfirmRestore = async () => {
    try {
      // Safety backup before destructive restore
      await createBackupJson();
      await restoreBackupJson(restoreJsonInput);
      setShowRestoreModal(false);
      setRestoreJsonInput('');
      setValidationPreview(null);
      setStatusMessage({
        type: 'success',
        text: 'Database successfully restored and verified from backup.',
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: `Restore aborted safely: ${(err as Error).message}`,
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

      {/* Appearance: Light Mode / Dark Mode / System Selector */}
      <SectionCard style={styles.section}>
        <Text style={[styles.sectionTitle, { color: palette.slate900 }]}>
          Appearance & Theme Mode
        </Text>
        <Text style={[styles.subText, { color: palette.slate500 }]}>
          Switch between Light Mode, Dark Mode, or automatic System preference.
        </Text>
        <View style={[styles.row, { marginTop: spacing.md }]}>
          {(
            [
              { key: 'light', label: 'Light Mode', icon: 'sun' },
              { key: 'dark', label: 'Dark Mode', icon: 'moon' },
              { key: 'system', label: 'System', icon: 'smartphone' },
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
                style={[
                  styles.fmtChip,
                  {
                    backgroundColor: active
                      ? palette.primary600
                      : palette.slate100,
                    borderColor: active
                      ? palette.primary600
                      : palette.slate300,
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 6,
                  },
                ]}
              >
                <Feather
                  name={opt.icon}
                  size={14}
                  color={active ? '#FFFFFF' : palette.slate700}
                />
                <Text
                  style={[
                    styles.fmtText,
                    { color: active ? '#FFFFFF' : palette.slate700 },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SectionCard>

      {/* Suppliers Module Shortcut */}
      <SectionCard style={styles.section}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>
              Supplier Management ({suppliers.length})
            </Text>
            <Text style={styles.subText}>
              Manage optional supplier contacts & view supplier inward histories
            </Text>
          </View>
          <PrimaryButton
            title="Open Suppliers"
            variant="secondary"
            icon="truck"
            onPress={() => router.push('/suppliers')}
          />
        </View>
      </SectionCard>

      {/* Backup & Restore Center */}
      <SectionCard style={styles.section}>
        <Text style={styles.sectionTitle}>
          Offline Data Backup & Safe Restore
        </Text>
        <Text style={styles.subText}>
          Export your complete local SQLite database (products, variants, stock events, threshold history, and daily snapshots) into a checksum-verified backup file.
        </Text>

        <View style={styles.btnCol}>
          <PrimaryButton
            title="Export & Share Full Backup File"
            icon="download-cloud"
            onPress={handleExportBackupFile}
          />
          <PrimaryButton
            title="Select Backup File from Device to Restore"
            variant="outline"
            icon="upload"
            onPress={handlePickBackupDocument}
          />
          <PrimaryButton
            title="Validate / Restore from Backup JSON"
            variant="outline"
            icon="shield"
            onPress={() => {
              setValidationPreview(null);
              setShowRestoreModal(true);
            }}
          />
        </View>
      </SectionCard>

      {/* Local Notification & Reminder Settings */}
      {notificationSettings ? (
        <SectionCard style={styles.section}>
          <Text style={styles.sectionTitle}>
            Local Alerts & Daily Reminders
          </Text>
          <Text style={styles.subText}>
            Operates 100% locally on your device without remote push servers.
          </Text>

          <View style={styles.switchRow}>
            <Text style={styles.label}>Low-Stock Transition Alerts</Text>
            <Switch
              value={notificationSettings.lowStockAlertsEnabled}
              onValueChange={(val) =>
                updateNotificationSettings({ lowStockAlertsEnabled: val })
              }
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.label}>Out-of-Stock Transition Alerts</Text>
            <Switch
              value={notificationSettings.outOfStockAlertsEnabled}
              onValueChange={(val) =>
                updateNotificationSettings({ outOfStockAlertsEnabled: val })
              }
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.label}>Daily Stock Count Reminder</Text>
            <Switch
              value={notificationSettings.dailyReminderEnabled}
              onValueChange={(val) =>
                updateNotificationSettings({ dailyReminderEnabled: val })
              }
            />
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.smallLabel}>Reminder Time (HH:mm)</Text>
              <TextInput
                style={styles.input}
                value={reminderTime}
                onChangeText={setReminderTime}
                onBlur={() =>
                  updateNotificationSettings({
                    dailyReminderTime: reminderTime,
                  })
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.smallLabel}>Summary Time (HH:mm)</Text>
              <TextInput
                style={styles.input}
                value={summaryTime}
                onChangeText={setSummaryTime}
                onBlur={() =>
                  updateNotificationSettings({ dailySummaryTime: summaryTime })
                }
              />
            </View>
          </View>
        </SectionCard>
      ) : null}

      {/* Business Workspace Profile */}
      <SectionCard style={styles.section}>
        <Text style={styles.sectionTitle}>Business Profile Configuration</Text>

        <Text style={styles.smallLabel}>Business Name *</Text>
        <TextInput
          style={styles.input}
          value={businessName}
          onChangeText={setBusinessName}
        />

        <Text style={styles.smallLabel}>Business Industry Type</Text>
        <TextInput
          style={styles.input}
          value={businessType}
          onChangeText={setBusinessType}
        />

        <Text style={styles.smallLabel}>Owner Name</Text>
        <TextInput
          style={styles.input}
          value={ownerName}
          onChangeText={setOwnerName}
        />

        <Text style={styles.smallLabel}>Contact Phone</Text>
        <TextInput
          style={styles.input}
          value={contactNumber}
          onChangeText={setContactNumber}
        />

        <Text style={styles.smallLabel}>Preferred Date Format</Text>
        <View style={styles.row}>
          {(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as DateFormatOption[]).map(
            (fmt) => (
              <TouchableOpacity
                key={fmt}
                onPress={() => setDateFormat(fmt)}
                style={[
                  styles.fmtChip,
                  dateFormat === fmt && styles.fmtChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.fmtText,
                    dateFormat === fmt && styles.fmtTextActive,
                  ]}
                >
                  {fmt}
                </Text>
              </TouchableOpacity>
            )
          )}
        </View>

        <PrimaryButton
          title="Save Business Profile"
          icon="save"
          onPress={handleSaveProfile}
          style={{ marginTop: spacing.md }}
        />
      </SectionCard>

      {/* Restore Confirmation & Validation Modal */}
      <Modal visible={showRestoreModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>
              Validate & Restore Backup Bundle
            </Text>
            <Text style={styles.subText}>
              Paste or inspect the backup JSON below. Checksum & schema integrity are verified before restoring.
            </Text>

            <TextInput
              style={[styles.input, { height: 110, marginTop: spacing.sm }]}
              multiline
              placeholder="Paste StockBeacon backup JSON content..."
              value={restoreJsonInput}
              onChangeText={setRestoreJsonInput}
            />

            <PrimaryButton
              title="Verify Backup Integrity & Checksum"
              variant="secondary"
              onPress={handleValidateManualJson}
              style={{ marginTop: spacing.sm }}
            />

            {validationPreview ? (
              <View
                style={[
                  styles.previewBox,
                  {
                    backgroundColor: validationPreview.isValid
                      ? palette.success50
                      : palette.danger50,
                  },
                ]}
              >
                {validationPreview.isValid && validationPreview.summary ? (
                  <>
                    <Text style={styles.validTitle}>
                      ✓ Valid StockBeacon Backup (v
                      {validationPreview.summary.schemaVersion})
                    </Text>
                    <Text style={styles.subText}>
                      Business: {validationPreview.summary.businessName}
                    </Text>
                    <Text style={styles.subText}>
                      Products: {validationPreview.summary.productsCount} •
                      Variants: {validationPreview.summary.variantsCount} •
                      Stock Events: {validationPreview.summary.stockEventsCount}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.invalidTitle}>
                    ✕ {validationPreview.error}
                  </Text>
                )}
              </View>
            ) : null}

            <View style={styles.row}>
              <PrimaryButton
                title="Cancel"
                variant="outline"
                onPress={() => setShowRestoreModal(false)}
                style={{ flex: 1, marginTop: spacing.md }}
              />
              {validationPreview?.isValid ? (
                <PrimaryButton
                  title="Confirm Restore"
                  variant="danger"
                  onPress={handleConfirmRestore}
                  style={{ flex: 1, marginTop: spacing.md }}
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
    padding: spacing.lg,
    paddingBottom: 40,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.slate900,
  },
  subText: {
    fontSize: 12,
    color: palette.slate500,
    marginTop: 2,
    lineHeight: 18,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  btnCol: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.slate800,
  },
  smallLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.slate600,
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.slate300,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    fontSize: 14,
    color: palette.slate900,
    backgroundColor: palette.slate50,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  fmtChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.slate300,
    alignItems: 'center',
    backgroundColor: palette.white,
  },
  fmtChipActive: {
    backgroundColor: palette.primary600,
    borderColor: palette.primary600,
  },
  fmtText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.slate700,
  },
  fmtTextActive: {
    color: palette.white,
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
    fontSize: 12,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  previewBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  validTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: palette.success700,
  },
    invalidTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: palette.danger700,
    },
  });
}
