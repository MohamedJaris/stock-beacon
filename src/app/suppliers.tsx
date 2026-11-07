import {
  EmptyStateView,
  PrimaryButton,
  SectionCard,
} from '@/components/common/AppComponents';
import { formatDisplayDate } from '@/core/utils/dateUtils';
import { formatQuantity } from '@/core/utils/quantityMath';
import { useAppStore } from '@/stores/useAppStore';
import { palette, radius, spacing } from '@/theme';
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

export default function SuppliersScreen() {
  const styles = getStyles();
  const profile = useAppStore((s) => s.profile);
  const isDarkMode = useAppStore((s) => s.isDarkMode);
  const suppliers = useAppStore((s) => s.suppliers);
  const recentEvents = useAppStore((s) => s.recentEvents);
  const addSupplier = useAppStore((s) => s.addSupplier);
  const updateSupplier = useAppStore((s) => s.updateSupplier);

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(
    null
  );

  const handleSave = async () => {
    setErrorMsg(null);
    if (!name.trim()) {
      setErrorMsg('Supplier name is required.');
      return;
    }
    try {
      await addSupplier({
        name: name.trim(),
        contactNumber: contactNumber.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setName('');
      setContactNumber('');
      setEmail('');
      setAddress('');
      setNotes('');
      setShowModal(false);
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Suppliers Directory</Text>
          <Text style={styles.subtitle}>
            Optional supplier contacts & inward stock delivery history
          </Text>
        </View>
        <PrimaryButton
          title="+ Add Supplier"
          onPress={() => setShowModal(true)}
        />
      </View>

      {suppliers.length === 0 ? (
        <EmptyStateView
          icon="truck"
          title="No Suppliers Added Yet"
          message="Supplier tracking is optional. Add suppliers here to associate them with products and incoming stock deliveries."
          actionTitle="Add First Supplier"
          onActionPress={() => setShowModal(true)}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {suppliers.map((sup) => {
            const inwardHistory = recentEvents.filter(
              (e) => e.supplierId === sup.id && e.eventType === 'STOCK_INWARD'
            );
            const expanded = selectedSupplierId === sup.id;

            return (
              <SectionCard key={sup.id}>
                <TouchableOpacity
                  onPress={() =>
                    setSelectedSupplierId(expanded ? null : sup.id)
                  }
                  style={styles.headerRow}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.supName}>{sup.name}</Text>
                    <Text style={styles.supMeta}>
                      {[sup.contactNumber, sup.email, sup.address]
                        .filter(Boolean)
                        .join(' • ') || 'No contact details specified'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.countPill}>
                      {inwardHistory.length} Inward Deliveries
                    </Text>
                  </View>
                </TouchableOpacity>

                {expanded ? (
                  <View style={styles.historySection}>
                    <Text style={styles.historyTitle}>
                      Associated Stock Inward Deliveries
                    </Text>
                    {inwardHistory.length === 0 ? (
                      <Text style={styles.supMeta}>
                        No inward deliveries linked to this supplier yet.
                      </Text>
                    ) : (
                      inwardHistory.map((ev) => (
                        <View key={ev.id} style={styles.historyRow}>
                          <Text style={styles.supMeta}>
                            {formatDisplayDate(
                              ev.eventDate,
                              profile?.dateFormat
                            )}{' '}
                            • {ev.displayName}
                          </Text>
                          <Text style={styles.qtyText}>
                            +{formatQuantity(ev.quantity, ev.unitSymbol)}
                          </Text>
                        </View>
                      ))
                    )}
                    <PrimaryButton
                      title="Archive Supplier"
                      variant="outline"
                      onPress={() =>
                        updateSupplier(sup.id, { isArchived: true })
                      }
                      style={{ marginTop: spacing.sm }}
                    />
                  </View>
                ) : null}
              </SectionCard>
            );
          })}
        </View>
      )}

      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.title}>Add Supplier</Text>
            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
            <Text style={styles.label}>Supplier / Distributor Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Metro Wholesale Distributors"
              value={name}
              onChangeText={setName}
            />
            <Text style={styles.label}>Contact Phone (Optional)</Text>
            <TextInput
              style={styles.input}
              keyboardType="phone-pad"
              value={contactNumber}
              onChangeText={setContactNumber}
            />
            <Text style={styles.label}>Email (Optional)</Text>
            <TextInput
              style={styles.input}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Text style={styles.label}>Address (Optional)</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
            />
            <Text style={styles.label}>Notes (Optional)</Text>
            <TextInput
              style={styles.input}
              value={notes}
              onChangeText={setNotes}
            />
            <View style={styles.modalActions}>
              <PrimaryButton
                title="Cancel"
                variant="outline"
                onPress={() => setShowModal(false)}
                style={{ flex: 1 }}
              />
              <PrimaryButton
                title="Save Supplier"
                onPress={handleSave}
                style={{ flex: 1 }}
              />
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
    paddingBottom: 36,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: palette.slate900,
  },
  subtitle: {
    fontSize: 12,
    color: palette.slate500,
    marginTop: 2,
  },
  supName: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.slate900,
  },
  supMeta: {
    fontSize: 12,
    color: palette.slate500,
    marginTop: 2,
  },
  countPill: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.primary600,
    backgroundColor: palette.primary50,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  historySection: {
    borderTopWidth: 1,
    borderTopColor: palette.slate200,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  historyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.slate700,
    marginBottom: 4,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  qtyText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.success700,
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
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.slate700,
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
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
    errorText: {
      color: palette.danger600,
      fontSize: 12,
      fontWeight: '600',
    },
  });
}
