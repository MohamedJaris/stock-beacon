import { PrimaryButton, SectionCard } from '@/components/common/AppComponents';
import {
  BUSINESS_TYPE_PRESETS,
  DateFormatOption,
} from '@/domain/enums';
import { useAppStore } from '@/stores/useAppStore';
import { palette, radius, spacing } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const DATE_FORMATS: DateFormatOption[] = [
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD',
];

const DEFAULT_UNIT_OPTIONS = [
  { label: 'Pieces (pcs)', symbol: 'pcs' },
  { label: 'Units (units)', symbol: 'units' },
  { label: 'Kilograms (kg)', symbol: 'kg' },
  { label: 'Metres (m)', symbol: 'm' },
  { label: 'Packs (packs)', symbol: 'packs' },
  { label: 'Boxes (boxes)', symbol: 'boxes' },
];

export default function OnboardingScreen() {
  const styles = getStyles();
  const router = useRouter();
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const isDarkMode = useAppStore((s) => s.isDarkMode);

  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState<string>(
    BUSINESS_TYPE_PRESETS[0]
  );
  const [customBusinessType, setCustomBusinessType] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [country, setCountry] = useState('India');
  const [dateFormat, setDateFormat] = useState<DateFormatOption>('DD/MM/YYYY');
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'
  );
  const [defaultUnitSymbol, setDefaultUnitSymbol] = useState('pcs');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleComplete = async () => {
    setErrorMsg(null);
    if (businessName.trim().length < 2) {
      setErrorMsg('Please enter your Business Name (at least 2 characters).');
      return;
    }
    const finalType =
      businessType === 'Other'
        ? customBusinessType.trim() || 'General Business'
        : businessType;

    setSubmitting(true);
    try {
      await completeOnboarding({
        businessName: businessName.trim(),
        businessType: finalType,
        ownerName: ownerName.trim() || null,
        contactNumber: contactNumber.trim() || null,
        businessAddress: businessAddress.trim() || null,
        country: country.trim() || 'India',
        dateFormat,
        timezone: timezone.trim() || 'Asia/Kolkata',
        defaultUnitSymbol,
      });
      router.replace('/(tabs)');
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: palette.slate50 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroBanner}>
          <View style={styles.logoBadge}>
            <Feather name="box" size={26} color={palette.white} />
          </View>
          <Text style={styles.heroTitle}>Welcome to StockBeacon</Text>
          <Text style={styles.heroSubtitle}>
            Standalone Offline-First Inventory & Replenishment Management.
            Works 100% offline with local SQLite persistence.
          </Text>
        </View>

        {errorMsg ? (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={16} color={palette.danger700} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        <SectionCard style={styles.section}>
          <Text style={styles.sectionTitle}>1. Business Identity</Text>

          <Text style={styles.label}>Business / Store Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Sri Krishna Textiles & Readymades"
            placeholderTextColor={palette.slate400}
            value={businessName}
            onChangeText={setBusinessName}
          />

          <Text style={styles.label}>Business Industry Type *</Text>
          <Text style={styles.helperText}>
            Pre-populates helpful starter categories; never restricts what products you can create.
          </Text>
          <View style={styles.chipGrid}>
            {BUSINESS_TYPE_PRESETS.map((preset) => {
              const selected = businessType === preset;
              return (
                <TouchableOpacity
                  key={preset}
                  onPress={() => setBusinessType(preset)}
                  style={[
                    styles.chip,
                    selected && styles.chipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected && styles.chipTextSelected,
                    ]}
                  >
                    {preset}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {businessType === 'Other' ? (
            <TextInput
              style={[styles.input, { marginTop: spacing.sm }]}
              placeholder="Specify your business type"
              placeholderTextColor={palette.slate400}
              value={customBusinessType}
              onChangeText={setCustomBusinessType}
            />
          ) : null}

          <Text style={styles.label}>Owner / Manager Name (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Rajesh Kumar"
            placeholderTextColor={palette.slate400}
            value={ownerName}
            onChangeText={setOwnerName}
          />

          <Text style={styles.label}>Contact Phone Number (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., +91 98765 43210"
            placeholderTextColor={palette.slate400}
            keyboardType="phone-pad"
            value={contactNumber}
            onChangeText={setContactNumber}
          />

          <Text style={styles.label}>Business Address (Optional)</Text>
          <TextInput
            style={[styles.input, { minHeight: 64 }]}
            placeholder="Shop / Warehouse street address and city"
            placeholderTextColor={palette.slate400}
            multiline
            value={businessAddress}
            onChangeText={setBusinessAddress}
          />
        </SectionCard>

        <SectionCard style={styles.section}>
          <Text style={styles.sectionTitle}>
            2. Regional & Measurement Defaults
          </Text>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Country *</Text>
              <TextInput
                style={styles.input}
                value={country}
                onChangeText={setCountry}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Local Timezone *</Text>
              <TextInput
                style={styles.input}
                value={timezone}
                onChangeText={setTimezone}
              />
            </View>
          </View>

          <Text style={styles.label}>Preferred Date Format</Text>
          <View style={styles.chipGrid}>
            {DATE_FORMATS.map((fmt) => {
              const selected = dateFormat === fmt;
              return (
                <TouchableOpacity
                  key={fmt}
                  onPress={() => setDateFormat(fmt)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected && styles.chipTextSelected,
                    ]}
                  >
                    {fmt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Default Unit of Measurement</Text>
          <View style={styles.chipGrid}>
            {DEFAULT_UNIT_OPTIONS.map((u) => {
              const selected = defaultUnitSymbol === u.symbol;
              return (
                <TouchableOpacity
                  key={u.symbol}
                  onPress={() => setDefaultUnitSymbol(u.symbol)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected && styles.chipTextSelected,
                    ]}
                  >
                    {u.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </SectionCard>

        <PrimaryButton
          title="Create Local Workspace & Start"
          icon="check-circle"
          loading={submitting}
          onPress={handleComplete}
          style={{ marginTop: spacing.md, marginBottom: spacing.xxxl }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function getStyles() {
  return StyleSheet.create({
    scrollContent: {
      padding: spacing.lg,
      paddingTop: 52,
    },
    heroBanner: {
      backgroundColor: '#0F172A',
      borderRadius: radius.lg,
      padding: spacing.xl,
      marginBottom: spacing.lg,
    },
    logoBadge: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: '#2563EB',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    heroTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: '#FFFFFF',
      marginBottom: 6,
    },
    heroSubtitle: {
      fontSize: 13,
      color: '#CBD5E1',
      lineHeight: 19,
    },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.danger50,
    borderColor: palette.danger100,
    borderWidth: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: palette.danger700,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.slate900,
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.slate700,
    marginTop: spacing.md,
    marginBottom: 6,
  },
  helperText: {
    fontSize: 12,
    color: palette.slate500,
    marginBottom: spacing.sm,
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
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.slate300,
    backgroundColor: palette.white,
  },
  chipSelected: {
    backgroundColor: palette.primary600,
    borderColor: palette.primary600,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.slate700,
  },
    chipTextSelected: {
      color: '#FFFFFF',
    },
  });
}
