import { getTodayInTimezone, isValidIsoDate } from '@/core/utils/dateUtils';
import { normalizeQuantity } from '@/core/utils/quantityMath';
import { generateId } from '@/core/utils/skuGenerator';
import {
  AppNotification,
  DailyInventorySnapshot,
  InventoryBalance,
  InventoryItemView,
  ProductThresholdHistory,
  StockEvent,
} from '@/domain/entities';
import {
  AlertState,
  QuantityProvenance,
  StockEventType,
  StockStatus,
} from '@/domain/enums';
import {
  ConsolidatedLowStockReportResult,
  DailyLowStockReportResult,
  generateConsolidatedLowStockReport,
  generateDailyLowStockHistory,
  ItemMetadataForReport,
} from '@/domain/services/HistoricalReportEngine';
import {
  buildDailyInventorySnapshots,
  calculateLedgerState,
  evaluateStockStatus,
  LedgerEventInput,
} from '@/domain/services/InventoryCalculationEngine';
import { evaluateLowStockAlertTransition } from '@/domain/services/LowStockAlertEngine';
import { IDatabaseAdapter } from '../database/DatabaseAdapter';

export interface StockOperationResult {
  event: StockEvent;
  balance: InventoryBalance;
  emittedNotification: AppNotification | null;
}

export interface BatchPhysicalCountResult {
  eventDate: string;
  processedCount: number;
  results: StockOperationResult[];
}

export interface StockEventWithDetails extends StockEvent {
  displayName: string;
  sku: string;
  unitSymbol: string;
  categoryName: string;
  supplierName: string | null;
}

export interface DashboardMetrics {
  totalSkus: number;
  inStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  unknownBaselineCount: number;
  inwardEntriesToday: number;
  needsPhysicalCountCount: number;
  lowStockItems: InventoryItemView[];
  recentEvents: StockEventWithDetails[];
  categoryDistribution: {
    categoryId: string;
    categoryName: string;
    colorHex: string;
    itemCount: number;
    lowOrOutCount: number;
  }[];
}

export class SqliteInventoryRepository {
  constructor(private readonly db: IDatabaseAdapter) {}

  /**
   * Returns the next monotonic sequence number for workspace ledger / threshold events.
   */
  private async getNextSequenceNo(workspaceId: string): Promise<number> {
    const maxEvent = await this.db.getFirstAsync<{ max_seq: number | null }>(
      'SELECT MAX(sequence_no) AS max_seq FROM stock_events WHERE workspace_id = ?',
      [workspaceId]
    );
    const maxThresh = await this.db.getFirstAsync<{ max_seq: number | null }>(
      'SELECT MAX(sequence_no) AS max_seq FROM product_threshold_history WHERE workspace_id = ?',
      [workspaceId]
    );
    const currentMax = Math.max(
      Number(maxEvent?.max_seq ?? 0),
      Number(maxThresh?.max_seq ?? 0)
    );
    return currentMax + 1;
  }

  /**
   * Initializes an item's baseline (`product_threshold_history`, optional `OPENING_STOCK`,
   * `inventory_balances`, and initial `daily_inventory_snapshots`) inside an active transaction.
   */
  async initializeItemBaselineInTransaction(params: {
    workspaceId: string;
    itemKey: string;
    productId: string;
    variantId: string | null;
    minStockThreshold: number;
    openingStock: number | null;
    effectiveDate: string;
    timestamp: string;
  }): Promise<void> {
    const seq1 = await this.getNextSequenceNo(params.workspaceId);
    const threshold = normalizeQuantity(params.minStockThreshold);

    // 1. Record initial threshold history
    await this.db.runAsync(
      `INSERT INTO product_threshold_history (
        id, workspace_id, item_key, product_id, variant_id,
        min_stock_threshold, effective_from_date, effective_timestamp,
        sequence_no, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Initial minimum threshold', ?)`,
      [
        generateId(),
        params.workspaceId,
        params.itemKey,
        params.productId,
        params.variantId,
        threshold,
        params.effectiveDate,
        params.timestamp,
        seq1,
        params.timestamp,
      ]
    );

    // 2. If openingStock is provided (not null), record OPENING_STOCK event
    let recordedQty: number | null = null;
    let provenance: QuantityProvenance = 'UNKNOWN';
    let lastEventId: string | null = null;

    if (params.openingStock !== null && params.openingStock !== undefined) {
      const openingQty = normalizeQuantity(params.openingStock);
      const eventId = generateId();
      const seq2 = seq1 + 1;
      await this.db.runAsync(
        `INSERT INTO stock_events (
          id, workspace_id, warehouse_id, item_key, product_id, variant_id,
          event_type, quantity, previous_balance, resulting_balance, variance_quantity,
          event_date, event_timestamp, sequence_no, supplier_id, reference_number,
          reason, notes, created_at
        ) VALUES (?, ?, NULL, ?, ?, ?, 'OPENING_STOCK', ?, NULL, ?, NULL, ?, ?, ?, NULL, NULL, 'Opening stock baseline', NULL, ?)`,
        [
          eventId,
          params.workspaceId,
          params.itemKey,
          params.productId,
          params.variantId,
          openingQty,
          openingQty,
          params.effectiveDate,
          params.timestamp,
          seq2,
          params.timestamp,
        ]
      );
      recordedQty = openingQty;
      provenance = 'CALCULATED_INWARD_ONLY';
      lastEventId = eventId;
    }

    const status = evaluateStockStatus(recordedQty, threshold);
    const initialAlertState: AlertState =
      status === 'OUT_OF_STOCK'
        ? 'OUT_OF_STOCK_ALERTED'
        : status === 'LOW_STOCK'
        ? 'LOW_STOCK_ALERTED'
        : 'NONE';

    // 3. Insert inventory_balances row
    await this.db.runAsync(
      `INSERT INTO inventory_balances (
        item_key, workspace_id, product_id, variant_id,
        recorded_quantity, min_stock_threshold, stock_status, quantity_provenance,
        last_physical_count_date, last_physical_count_qty, last_inward_date,
        last_event_id, active_alert_state, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
      [
        params.itemKey,
        params.workspaceId,
        params.productId,
        params.variantId,
        recordedQty,
        threshold,
        status,
        provenance,
        lastEventId,
        initialAlertState,
        params.timestamp,
      ]
    );

    // 4. Rebuild daily snapshot for effectiveDate through today
    const today = getTodayInTimezone('Asia/Kolkata');
    const startSnap =
      params.effectiveDate <= today ? params.effectiveDate : today;
    const endSnap =
      params.effectiveDate >= today ? params.effectiveDate : today;
    await this.rebuildItemStateAndSnapshotsInTransaction({
      workspaceId: params.workspaceId,
      itemKey: params.itemKey,
      fromDate: startSnap,
      throughDate: endSnap,
      preserveAlertEvaluation: true,
    });
  }

  /**
   * Re-reads all ledger events and threshold history for `itemKey`, recalculates
   * the authoritative ledger state, updates `stock_events` balances if a backdated event
   * was inserted, updates `inventory_balances`, evaluates low-stock alert transitions,
   * and rebuilds `daily_inventory_snapshots` across the affected window.
   */
  async rebuildItemStateAndSnapshotsInTransaction(params: {
    workspaceId: string;
    itemKey: string;
    fromDate?: string;
    throughDate?: string;
    preserveAlertEvaluation?: boolean;
  }): Promise<{
    balance: InventoryBalance;
    emittedNotification: AppNotification | null;
  }> {
    const balanceRow = await this.db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM inventory_balances WHERE item_key = ? AND workspace_id = ?',
      [params.itemKey, params.workspaceId]
    );
    if (!balanceRow) {
      throw new Error(`Inventory balance record not found for item ${params.itemKey}`);
    }

    const productId = String(balanceRow.product_id);
    const variantId = balanceRow.variant_id
      ? String(balanceRow.variant_id)
      : null;
    const currentThreshold = Number(balanceRow.min_stock_threshold);
    const previousAlertState = (balanceRow.active_alert_state ||
      'NONE') as AlertState;

    const rawEvents = await this.db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM stock_events
       WHERE workspace_id = ? AND item_key = ?
       ORDER BY event_date ASC, sequence_no ASC, event_timestamp ASC`,
      [params.workspaceId, params.itemKey]
    );

    const eventInputs: LedgerEventInput[] = rawEvents.map((r) => ({
      id: String(r.id),
      eventType: r.event_type as StockEventType,
      quantity: Number(r.quantity),
      eventDate: String(r.event_date),
      eventTimestamp: String(r.event_timestamp),
      sequenceNo: Number(r.sequence_no),
      supplierId: r.supplier_id ? String(r.supplier_id) : null,
      referenceNumber: r.reference_number ? String(r.reference_number) : null,
      reason: r.reason ? String(r.reason) : null,
      notes: r.notes ? String(r.notes) : null,
    }));

    const computed = calculateLedgerState({
      workspaceId: params.workspaceId,
      itemKey: params.itemKey,
      productId,
      variantId,
      currentThreshold,
      events: eventInputs,
    });

    // Update each event's previous_balance, resulting_balance, and variance_quantity in case a backdated event was inserted
    for (const ev of computed.processedEvents) {
      await this.db.runAsync(
        `UPDATE stock_events
         SET previous_balance = ?, resulting_balance = ?, variance_quantity = ?
         WHERE id = ?`,
        [ev.previousBalance, ev.resultingBalance, ev.varianceQuantity, ev.id]
      );
    }

    // Evaluate low-stock alert transition
    let newAlertState: AlertState = previousAlertState;
    let emittedNotification: AppNotification | null = null;

    if (!params.preserveAlertEvaluation) {
      const meta = await this.getItemDisplayMetadata(
        params.workspaceId,
        params.itemKey
      );
      const notifSettings = await this.db.getFirstAsync<Record<string, unknown>>(
        'SELECT * FROM notification_settings WHERE workspace_id = ?',
        [params.workspaceId]
      );

      const transition = evaluateLowStockAlertTransition({
        itemDisplayName: meta?.displayName ?? 'Inventory Item',
        unitSymbol: meta?.unitSymbol ?? 'units',
        recordedQuantity: computed.recordedQuantity,
        minStockThreshold: currentThreshold,
        newStatus: computed.stockStatus,
        previousAlertState,
        lowStockAlertsEnabled: notifSettings
          ? Boolean(notifSettings.low_stock_alerts_enabled)
          : true,
        outOfStockAlertsEnabled: notifSettings
          ? Boolean(notifSettings.out_of_stock_alerts_enabled)
          : true,
      });

      newAlertState = transition.newAlertState;

      if (
        transition.shouldEmitNotification &&
        transition.notificationType &&
        transition.title &&
        transition.message
      ) {
        const notifId = generateId();
        const nowIso = new Date().toISOString();
        await this.db.runAsync(
          `INSERT INTO notifications (
            id, workspace_id, item_key, product_id, variant_id,
            notification_type, title, message, is_read, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
          [
            notifId,
            params.workspaceId,
            params.itemKey,
            productId,
            variantId,
            transition.notificationType,
            transition.title,
            transition.message,
            nowIso,
          ]
        );
        emittedNotification = {
          id: notifId,
          workspaceId: params.workspaceId,
          itemKey: params.itemKey,
          productId,
          variantId,
          notificationType: transition.notificationType,
          title: transition.title,
          message: transition.message,
          isRead: false,
          createdAt: nowIso,
        };
      }
    }

    const now = new Date().toISOString();
    await this.db.runAsync(
      `UPDATE inventory_balances SET
        recorded_quantity = ?,
        min_stock_threshold = ?,
        stock_status = ?,
        quantity_provenance = ?,
        last_physical_count_date = ?,
        last_physical_count_qty = ?,
        last_inward_date = ?,
        last_event_id = ?,
        active_alert_state = ?,
        updated_at = ?
      WHERE item_key = ? AND workspace_id = ?`,
      [
        computed.recordedQuantity,
        currentThreshold,
        computed.stockStatus,
        computed.quantityProvenance,
        computed.lastPhysicalCountDate,
        computed.lastPhysicalCountQty,
        computed.lastInwardDate,
        computed.lastEventId,
        newAlertState,
        now,
        params.itemKey,
        params.workspaceId,
      ]
    );

    // Rebuild DailyInventorySnapshots across the item's date span
    const thresholdHistory = await this.getItemThresholdHistory(
      params.workspaceId,
      params.itemKey
    );

    const today = getTodayInTimezone('Asia/Kolkata');
    const candidateDates: string[] = [today];
    if (params.fromDate) candidateDates.push(params.fromDate);
    if (params.throughDate) candidateDates.push(params.throughDate);
    for (const ev of computed.processedEvents) {
      candidateDates.push(ev.eventDate);
    }
    for (const th of thresholdHistory) {
      candidateDates.push(th.effectiveFromDate);
    }
    const existingMaxSnap = await this.db.getFirstAsync<{
      min_d: string | null;
      max_d: string | null;
    }>(
      `SELECT MIN(snapshot_date) AS min_d, MAX(snapshot_date) AS max_d
       FROM daily_inventory_snapshots
       WHERE workspace_id = ? AND item_key = ?`,
      [params.workspaceId, params.itemKey]
    );
    if (existingMaxSnap?.min_d) candidateDates.push(existingMaxSnap.min_d);
    if (existingMaxSnap?.max_d) candidateDates.push(existingMaxSnap.max_d);

    candidateDates.sort();
    const minDate = candidateDates[0];
    const maxDate = candidateDates[candidateDates.length - 1];

    const snapshots = buildDailyInventorySnapshots({
      workspaceId: params.workspaceId,
      itemKey: params.itemKey,
      productId,
      variantId,
      startDate: minDate,
      endDate: maxDate,
      events: computed.processedEvents,
      thresholdHistory,
      fallbackThreshold: currentThreshold,
      generatedAt: now,
    });

    for (const snap of snapshots) {
      await this.db.runAsync(
        `INSERT INTO daily_inventory_snapshots (
          id, workspace_id, item_key, product_id, variant_id,
          snapshot_date, recorded_quantity, min_stock_threshold,
          stock_status, quantity_source, last_physical_count_date, generated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, item_key, snapshot_date) DO UPDATE SET
          recorded_quantity = excluded.recorded_quantity,
          min_stock_threshold = excluded.min_stock_threshold,
          stock_status = excluded.stock_status,
          quantity_source = excluded.quantity_source,
          last_physical_count_date = excluded.last_physical_count_date,
          generated_at = excluded.generated_at`,
        [
          snap.id,
          snap.workspaceId,
          snap.itemKey,
          snap.productId,
          snap.variantId,
          snap.snapshotDate,
          snap.recordedQuantity,
          snap.minStockThreshold,
          snap.stockStatus,
          snap.quantitySource,
          snap.lastPhysicalCountDate,
          snap.generatedAt,
        ]
      );
    }

    const updatedBalance: InventoryBalance = {
      itemKey: params.itemKey,
      workspaceId: params.workspaceId,
      productId,
      variantId,
      recordedQuantity: computed.recordedQuantity,
      minStockThreshold: currentThreshold,
      stockStatus: computed.stockStatus,
      quantityProvenance: computed.quantityProvenance,
      lastPhysicalCountDate: computed.lastPhysicalCountDate,
      lastPhysicalCountQty: computed.lastPhysicalCountQty,
      lastInwardDate: computed.lastInwardDate,
      lastEventId: computed.lastEventId,
      activeAlertState: newAlertState,
      updatedAt: now,
    };

    return {
      balance: updatedBalance,
      emittedNotification,
    };
  }

  // ===========================================================================
  // WORKFLOW A: RECORD STOCK INWARD (ATOMIC)
  // ===========================================================================
  async recordStockInward(params: {
    workspaceId: string;
    itemKey: string;
    productId: string;
    variantId?: string | null;
    quantity: number;
    eventDate: string;
    eventTimestamp?: string;
    supplierId?: string | null;
    referenceNumber?: string | null;
    notes?: string | null;
  }): Promise<StockOperationResult> {
    if (!params.quantity || params.quantity <= 0 || Number.isNaN(params.quantity)) {
      throw new Error('Stock inward quantity must be greater than zero.');
    }
    if (!isValidIsoDate(params.eventDate)) {
      throw new Error(`Invalid stock inward date: ${params.eventDate}`);
    }

    return await this.db.withTransactionAsync(async () => {
      const eventId = generateId();
      const now = params.eventTimestamp || new Date().toISOString();
      const seqNo = await this.getNextSequenceNo(params.workspaceId);
      const qty = normalizeQuantity(params.quantity);

      await this.db.runAsync(
        `INSERT INTO stock_events (
          id, workspace_id, warehouse_id, item_key, product_id, variant_id,
          event_type, quantity, previous_balance, resulting_balance, variance_quantity,
          event_date, event_timestamp, sequence_no, supplier_id, reference_number,
          reason, notes, created_at
        ) VALUES (?, ?, NULL, ?, ?, ?, 'STOCK_INWARD', ?, 0, 0, NULL, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        [
          eventId,
          params.workspaceId,
          params.itemKey,
          params.productId,
          params.variantId ?? null,
          qty,
          params.eventDate,
          now,
          seqNo,
          params.supplierId ?? null,
          params.referenceNumber?.trim() || null,
          params.notes?.trim() || null,
          now,
        ]
      );

      const { balance, emittedNotification } =
        await this.rebuildItemStateAndSnapshotsInTransaction({
          workspaceId: params.workspaceId,
          itemKey: params.itemKey,
          fromDate: params.eventDate,
        });

      const savedEvent = await this.getStockEventById(eventId);
      if (!savedEvent) {
        throw new Error('Failed to load recorded stock inward event.');
      }

      await this.db.runAsync(
        `INSERT INTO audit_logs (
          id, workspace_id, action_type, entity_type, entity_id, summary, metadata_json, created_at
        ) VALUES (?, ?, 'STOCK_INWARD_RECORDED', 'STOCK_EVENT', ?, ?, ?, ?)`,
        [
          generateId(),
          params.workspaceId,
          eventId,
          `Recorded inward stock +${qty} on ${params.eventDate}`,
          JSON.stringify({
            itemKey: params.itemKey,
            quantity: qty,
            resultingBalance: savedEvent.resultingBalance,
          }),
          now,
        ]
      );

      return {
        event: savedEvent,
        balance,
        emittedNotification,
      };
    });
  }

  // ===========================================================================
  // WORKFLOW B: DAILY PHYSICAL STOCK COUNT (SINGLE OR BATCH, ATOMIC)
  // ===========================================================================
  async recordBatchPhysicalCount(params: {
    workspaceId: string;
    eventDate: string;
    eventTimestamp?: string;
    sessionNotes?: string | null;
    entries: {
      itemKey: string;
      productId: string;
      variantId?: string | null;
      countedQuantity: number;
      notes?: string | null;
    }[];
  }): Promise<BatchPhysicalCountResult> {
    if (!isValidIsoDate(params.eventDate)) {
      throw new Error(`Invalid physical count date: ${params.eventDate}`);
    }
    if (!params.entries || params.entries.length === 0) {
      throw new Error('At least one product physical count entry is required.');
    }

    for (const entry of params.entries) {
      if (
        entry.countedQuantity < 0 ||
        Number.isNaN(entry.countedQuantity) ||
        !Number.isFinite(entry.countedQuantity)
      ) {
        throw new Error('Physical stock count quantity cannot be negative.');
      }
    }

    return await this.db.withTransactionAsync(async () => {
      const results: StockOperationResult[] = [];
      const now = params.eventTimestamp || new Date().toISOString();

      for (const entry of params.entries) {
        const eventId = generateId();
        const seqNo = await this.getNextSequenceNo(params.workspaceId);
        const countedQty = normalizeQuantity(entry.countedQuantity);
        const combinedNotes = [
          entry.notes?.trim(),
          params.sessionNotes?.trim(),
        ]
          .filter(Boolean)
          .join(' — ');

        await this.db.runAsync(
          `INSERT INTO stock_events (
            id, workspace_id, warehouse_id, item_key, product_id, variant_id,
            event_type, quantity, previous_balance, resulting_balance, variance_quantity,
            event_date, event_timestamp, sequence_no, supplier_id, reference_number,
            reason, notes, created_at
          ) VALUES (?, ?, NULL, ?, ?, ?, 'PHYSICAL_COUNT', ?, NULL, ?, NULL, ?, ?, ?, NULL, NULL, 'Physical inventory count', ?, ?)`,
          [
            eventId,
            params.workspaceId,
            entry.itemKey,
            entry.productId,
            entry.variantId ?? null,
            countedQty,
            countedQty,
            params.eventDate,
            now,
            seqNo,
            combinedNotes || null,
            now,
          ]
        );

        const { balance, emittedNotification } =
          await this.rebuildItemStateAndSnapshotsInTransaction({
            workspaceId: params.workspaceId,
            itemKey: entry.itemKey,
            fromDate: params.eventDate,
          });

        const savedEvent = await this.getStockEventById(eventId);
        if (!savedEvent) {
          throw new Error('Failed to load physical count event.');
        }

        results.push({
          event: savedEvent,
          balance,
          emittedNotification,
        });
      }

      await this.db.runAsync(
        `INSERT INTO audit_logs (
          id, workspace_id, action_type, entity_type, entity_id, summary, metadata_json, created_at
        ) VALUES (?, ?, 'PHYSICAL_COUNT_RECORDED', 'STOCK_EVENT', ?, ?, ?, ?)`,
        [
          generateId(),
          params.workspaceId,
          results[0].event.id,
          `Recorded physical stock count for ${results.length} item(s) on ${params.eventDate}`,
          JSON.stringify({
            eventDate: params.eventDate,
            count: results.length,
          }),
          now,
        ]
      );

      return {
        eventDate: params.eventDate,
        processedCount: results.length,
        results,
      };
    });
  }

  // ===========================================================================
  // WORKFLOW C: OPENING STOCK (FOR ITEMS PREVIOUSLY WITHOUT BASELINE)
  // ===========================================================================
  async recordOpeningStock(params: {
    workspaceId: string;
    itemKey: string;
    productId: string;
    variantId?: string | null;
    quantity: number;
    eventDate: string;
    notes?: string | null;
  }): Promise<StockOperationResult> {
    if (params.quantity < 0 || Number.isNaN(params.quantity)) {
      throw new Error('Opening stock quantity cannot be negative.');
    }
    if (!isValidIsoDate(params.eventDate)) {
      throw new Error(`Invalid opening stock date: ${params.eventDate}`);
    }

    return await this.db.withTransactionAsync(async () => {
      const eventId = generateId();
      const now = new Date().toISOString();
      const seqNo = await this.getNextSequenceNo(params.workspaceId);
      const qty = normalizeQuantity(params.quantity);

      await this.db.runAsync(
        `INSERT INTO stock_events (
          id, workspace_id, warehouse_id, item_key, product_id, variant_id,
          event_type, quantity, previous_balance, resulting_balance, variance_quantity,
          event_date, event_timestamp, sequence_no, supplier_id, reference_number,
          reason, notes, created_at
        ) VALUES (?, ?, NULL, ?, ?, ?, 'OPENING_STOCK', ?, NULL, ?, NULL, ?, ?, ?, NULL, NULL, 'Opening stock baseline', ?, ?)`,
        [
          eventId,
          params.workspaceId,
          params.itemKey,
          params.productId,
          params.variantId ?? null,
          qty,
          qty,
          params.eventDate,
          now,
          seqNo,
          params.notes?.trim() || null,
          now,
        ]
      );

      const { balance, emittedNotification } =
        await this.rebuildItemStateAndSnapshotsInTransaction({
          workspaceId: params.workspaceId,
          itemKey: params.itemKey,
          fromDate: params.eventDate,
        });

      const savedEvent = await this.getStockEventById(eventId);
      if (!savedEvent) {
        throw new Error('Failed to load opening stock event.');
      }

      return {
        event: savedEvent,
        balance,
        emittedNotification,
      };
    });
  }

  // ===========================================================================
  // WORKFLOW D: CONTROLLED STOCK ADJUSTMENT (ATOMIC)
  // ===========================================================================
  async recordStockAdjustment(params: {
    workspaceId: string;
    itemKey: string;
    productId: string;
    variantId?: string | null;
    quantityDelta: number;
    reason: string;
    eventDate: string;
    notes?: string | null;
  }): Promise<StockOperationResult> {
    if (!params.quantityDelta || params.quantityDelta === 0) {
      throw new Error('Stock adjustment quantity difference cannot be zero.');
    }
    if (!params.reason || !params.reason.trim()) {
      throw new Error('A reason is required for stock adjustments.');
    }
    if (!isValidIsoDate(params.eventDate)) {
      throw new Error(`Invalid stock adjustment date: ${params.eventDate}`);
    }

    return await this.db.withTransactionAsync(async () => {
      const eventId = generateId();
      const now = new Date().toISOString();
      const seqNo = await this.getNextSequenceNo(params.workspaceId);
      const delta = normalizeQuantity(params.quantityDelta);

      await this.db.runAsync(
        `INSERT INTO stock_events (
          id, workspace_id, warehouse_id, item_key, product_id, variant_id,
          event_type, quantity, previous_balance, resulting_balance, variance_quantity,
          event_date, event_timestamp, sequence_no, supplier_id, reference_number,
          reason, notes, created_at
        ) VALUES (?, ?, NULL, ?, ?, ?, 'STOCK_ADJUSTMENT', ?, 0, 0, NULL, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
        [
          eventId,
          params.workspaceId,
          params.itemKey,
          params.productId,
          params.variantId ?? null,
          delta,
          params.eventDate,
          now,
          seqNo,
          params.reason.trim(),
          params.notes?.trim() || null,
          now,
        ]
      );

      const { balance, emittedNotification } =
        await this.rebuildItemStateAndSnapshotsInTransaction({
          workspaceId: params.workspaceId,
          itemKey: params.itemKey,
          fromDate: params.eventDate,
        });

      const savedEvent = await this.getStockEventById(eventId);
      if (!savedEvent) {
        throw new Error('Failed to load stock adjustment event.');
      }

      await this.db.runAsync(
        `INSERT INTO audit_logs (
          id, workspace_id, action_type, entity_type, entity_id, summary, metadata_json, created_at
        ) VALUES (?, ?, 'STOCK_ADJUSTED', 'STOCK_EVENT', ?, ?, ?, ?)`,
        [
          generateId(),
          params.workspaceId,
          eventId,
          `Adjusted stock by ${delta > 0 ? `+${delta}` : delta} (${params.reason.trim()})`,
          JSON.stringify({
            itemKey: params.itemKey,
            delta,
            reason: params.reason.trim(),
          }),
          now,
        ]
      );

      return {
        event: savedEvent,
        balance,
        emittedNotification,
      };
    });
  }

  // ===========================================================================
  // THRESHOLD UPDATE WITH HISTORICAL PRESERVATION
  // ===========================================================================
  async updateMinimumThreshold(params: {
    workspaceId: string;
    itemKey: string;
    productId: string;
    variantId?: string | null;
    newThreshold: number;
    effectiveDate: string;
    reason?: string | null;
  }): Promise<{
    balance: InventoryBalance;
    emittedNotification: AppNotification | null;
  }> {
    if (
      params.newThreshold < 0 ||
      Number.isNaN(params.newThreshold) ||
      !Number.isFinite(params.newThreshold)
    ) {
      throw new Error('Minimum stock threshold cannot be negative.');
    }
    if (!isValidIsoDate(params.effectiveDate)) {
      throw new Error(`Invalid effective date: ${params.effectiveDate}`);
    }

    return await this.db.withTransactionAsync(async () => {
      return await this.updateMinimumThresholdInTransaction(params);
    });
  }

  async updateMinimumThresholdInTransaction(params: {
    workspaceId: string;
    itemKey: string;
    productId: string;
    variantId?: string | null;
    newThreshold: number;
    effectiveDate: string;
    reason?: string | null;
  }): Promise<{
    balance: InventoryBalance;
    emittedNotification: AppNotification | null;
  }> {
    const now = new Date().toISOString();
    const seqNo = await this.getNextSequenceNo(params.workspaceId);
    const threshold = normalizeQuantity(params.newThreshold);

    if (params.variantId) {
      await this.db.runAsync(
        'UPDATE product_variants SET min_stock_threshold = ?, updated_at = ? WHERE id = ? AND workspace_id = ?',
        [threshold, now, params.variantId, params.workspaceId]
      );
    } else {
      await this.db.runAsync(
        'UPDATE products SET min_stock_threshold = ?, updated_at = ? WHERE id = ? AND workspace_id = ?',
        [threshold, now, params.productId, params.workspaceId]
      );
    }

    await this.db.runAsync(
      'UPDATE inventory_balances SET min_stock_threshold = ?, updated_at = ? WHERE item_key = ? AND workspace_id = ?',
      [threshold, now, params.itemKey, params.workspaceId]
    );

    await this.db.runAsync(
      `INSERT INTO product_threshold_history (
        id, workspace_id, item_key, product_id, variant_id,
        min_stock_threshold, effective_from_date, effective_timestamp,
        sequence_no, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        generateId(),
        params.workspaceId,
        params.itemKey,
        params.productId,
        params.variantId ?? null,
        threshold,
        params.effectiveDate,
        now,
        seqNo,
        params.reason?.trim() || 'Threshold updated',
        now,
      ]
    );

    return await this.rebuildItemStateAndSnapshotsInTransaction({
      workspaceId: params.workspaceId,
      itemKey: params.itemKey,
      fromDate: params.effectiveDate,
    });
  }

  // ===========================================================================
  // HISTORICAL REPORTS (REPORT A: DAILY LOW-STOCK & REPORT B: CONSOLIDATED)
  // ===========================================================================
  private async ensureSnapshotsBuiltForDateRange(
    workspaceId: string,
    startDate: string,
    endDate: string
  ): Promise<void> {
    const items = await this.db.getAllAsync<{ item_key: string }>(
      'SELECT item_key FROM inventory_balances WHERE workspace_id = ?',
      [workspaceId]
    );

    for (const item of items) {
      await this.rebuildItemStateAndSnapshotsInTransaction({
        workspaceId,
        itemKey: item.item_key,
        fromDate: startDate,
        throughDate: endDate,
        preserveAlertEvaluation: true,
      });
    }
  }

  async getDailyLowStockHistoryReport(params: {
    workspaceId: string;
    startDate: string;
    endDate: string;
    categoryId?: string | null;
    itemKey?: string | null;
    searchQuery?: string;
    includeAllStatuses?: boolean;
  }): Promise<DailyLowStockReportResult> {
    await this.db.withTransactionAsync(async () => {
      await this.ensureSnapshotsBuiltForDateRange(
        params.workspaceId,
        params.startDate,
        params.endDate
      );
    });

    const snapshots = await this.getSnapshotsInDateRange(
      params.workspaceId,
      params.startDate,
      params.endDate
    );
    const itemsMap = await this.getItemsMetadataMap(params.workspaceId);

    return generateDailyLowStockHistory({
      startDate: params.startDate,
      endDate: params.endDate,
      snapshots,
      itemsMap,
      categoryIdFilter: params.categoryId,
      itemKeyFilter: params.itemKey,
      searchQuery: params.searchQuery,
      includeAllStatuses: params.includeAllStatuses,
    });
  }

  async getConsolidatedLowStockReport(params: {
    workspaceId: string;
    startDate: string;
    endDate: string;
    categoryId?: string | null;
    searchQuery?: string;
  }): Promise<ConsolidatedLowStockReportResult> {
    await this.db.withTransactionAsync(async () => {
      await this.ensureSnapshotsBuiltForDateRange(
        params.workspaceId,
        params.startDate,
        params.endDate
      );
    });

    const snapshots = await this.getSnapshotsInDateRange(
      params.workspaceId,
      params.startDate,
      params.endDate
    );
    const itemsMap = await this.getItemsMetadataMap(params.workspaceId);

    return generateConsolidatedLowStockReport({
      startDate: params.startDate,
      endDate: params.endDate,
      snapshots,
      itemsMap,
      categoryIdFilter: params.categoryId,
      searchQuery: params.searchQuery,
    });
  }

  // ===========================================================================
  // LEDGER & DASHBOARD QUERIES
  // ===========================================================================
  async listStockEvents(params: {
    workspaceId: string;
    itemKey?: string | null;
    productId?: string | null;
    supplierId?: string | null;
    eventType?: StockEventType | null;
    startDate?: string | null;
    endDate?: string | null;
    limit?: number;
  }): Promise<StockEventWithDetails[]> {
    const conditions: string[] = ['se.workspace_id = ?'];
    const bind: (string | number | null)[] = [params.workspaceId];

    if (params.itemKey) {
      conditions.push('se.item_key = ?');
      bind.push(params.itemKey);
    }
    if (params.productId) {
      conditions.push('se.product_id = ?');
      bind.push(params.productId);
    }
    if (params.supplierId) {
      conditions.push('se.supplier_id = ?');
      bind.push(params.supplierId);
    }
    if (params.eventType) {
      conditions.push('se.event_type = ?');
      bind.push(params.eventType);
    }
    if (params.startDate) {
      conditions.push('se.event_date >= ?');
      bind.push(params.startDate);
    }
    if (params.endDate) {
      conditions.push('se.event_date <= ?');
      bind.push(params.endDate);
    }

    const limit = params.limit ?? 250;
    bind.push(limit);

    const rows = await this.db.getAllAsync<Record<string, unknown>>(
      `SELECT
        se.*,
        p.name AS product_name,
        p.sku AS product_sku,
        pv.variant_name,
        pv.sku AS variant_sku,
        c.name AS category_name,
        u.symbol AS unit_symbol,
        s.name AS supplier_name
      FROM stock_events se
      INNER JOIN products p ON p.id = se.product_id
      LEFT JOIN product_variants pv ON pv.id = se.variant_id
      INNER JOIN categories c ON c.id = p.category_id
      INNER JOIN units_of_measure u ON u.id = p.unit_id
      LEFT JOIN suppliers s ON s.id = se.supplier_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY se.event_date DESC, se.sequence_no DESC
      LIMIT ?`,
      bind
    );

    return rows.map((r) => {
      const productName = String(r.product_name);
      const variantName = r.variant_name ? String(r.variant_name) : null;
      return {
        id: String(r.id),
        workspaceId: String(r.workspace_id),
        warehouseId: r.warehouse_id ? String(r.warehouse_id) : null,
        itemKey: String(r.item_key),
        productId: String(r.product_id),
        variantId: r.variant_id ? String(r.variant_id) : null,
        eventType: r.event_type as StockEventType,
        quantity: Number(r.quantity),
        previousBalance:
          r.previous_balance !== null && r.previous_balance !== undefined
            ? Number(r.previous_balance)
            : null,
        resultingBalance: Number(r.resulting_balance),
        varianceQuantity:
          r.variance_quantity !== null && r.variance_quantity !== undefined
            ? Number(r.variance_quantity)
            : null,
        eventDate: String(r.event_date),
        eventTimestamp: String(r.event_timestamp),
        sequenceNo: Number(r.sequence_no),
        supplierId: r.supplier_id ? String(r.supplier_id) : null,
        referenceNumber: r.reference_number
          ? String(r.reference_number)
          : null,
        reason: r.reason ? String(r.reason) : null,
        notes: r.notes ? String(r.notes) : null,
        createdAt: String(r.created_at),
        displayName: variantName
          ? `${productName} (${variantName})`
          : productName,
        sku: r.variant_sku ? String(r.variant_sku) : String(r.product_sku),
        unitSymbol: String(r.unit_symbol),
        categoryName: String(r.category_name),
        supplierName: r.supplier_name ? String(r.supplier_name) : null,
      };
    });
  }

  async getItemThresholdHistory(
    workspaceId: string,
    itemKey: string
  ): Promise<ProductThresholdHistory[]> {
    const rows = await this.db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM product_threshold_history
       WHERE workspace_id = ? AND item_key = ?
       ORDER BY effective_from_date ASC, sequence_no ASC`,
      [workspaceId, itemKey]
    );
    return rows.map((r) => ({
      id: String(r.id),
      workspaceId: String(r.workspace_id),
      itemKey: String(r.item_key),
      productId: String(r.product_id),
      variantId: r.variant_id ? String(r.variant_id) : null,
      minStockThreshold: Number(r.min_stock_threshold),
      effectiveFromDate: String(r.effective_from_date),
      effectiveTimestamp: String(r.effective_timestamp),
      sequenceNo: Number(r.sequence_no),
      reason: r.reason ? String(r.reason) : null,
      createdAt: String(r.created_at),
    }));
  }

  private async getStockEventById(id: string): Promise<StockEvent | null> {
    const r = await this.db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM stock_events WHERE id = ?',
      [id]
    );
    if (!r) return null;
    return {
      id: String(r.id),
      workspaceId: String(r.workspace_id),
      warehouseId: r.warehouse_id ? String(r.warehouse_id) : null,
      itemKey: String(r.item_key),
      productId: String(r.product_id),
      variantId: r.variant_id ? String(r.variant_id) : null,
      eventType: r.event_type as StockEventType,
      quantity: Number(r.quantity),
      previousBalance:
        r.previous_balance !== null && r.previous_balance !== undefined
          ? Number(r.previous_balance)
          : null,
      resultingBalance: Number(r.resulting_balance),
      varianceQuantity:
        r.variance_quantity !== null && r.variance_quantity !== undefined
          ? Number(r.variance_quantity)
          : null,
      eventDate: String(r.event_date),
      eventTimestamp: String(r.event_timestamp),
      sequenceNo: Number(r.sequence_no),
      supplierId: r.supplier_id ? String(r.supplier_id) : null,
      referenceNumber: r.reference_number ? String(r.reference_number) : null,
      reason: r.reason ? String(r.reason) : null,
      notes: r.notes ? String(r.notes) : null,
      createdAt: String(r.created_at),
    };
  }

  private async getSnapshotsInDateRange(
    workspaceId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyInventorySnapshot[]> {
    const rows = await this.db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM daily_inventory_snapshots
       WHERE workspace_id = ? AND snapshot_date >= ? AND snapshot_date <= ?
       ORDER BY snapshot_date ASC`,
      [workspaceId, startDate, endDate]
    );
    return rows.map((r) => ({
      id: String(r.id),
      workspaceId: String(r.workspace_id),
      itemKey: String(r.item_key),
      productId: String(r.product_id),
      variantId: r.variant_id ? String(r.variant_id) : null,
      snapshotDate: String(r.snapshot_date),
      recordedQuantity:
        r.recorded_quantity !== null && r.recorded_quantity !== undefined
          ? Number(r.recorded_quantity)
          : null,
      minStockThreshold: Number(r.min_stock_threshold),
      stockStatus: r.stock_status as StockStatus,
      quantitySource: r.quantity_source as QuantityProvenance,
      lastPhysicalCountDate: r.last_physical_count_date
        ? String(r.last_physical_count_date)
        : null,
      generatedAt: String(r.generated_at),
    }));
  }

  private async getItemsMetadataMap(
    workspaceId: string
  ): Promise<Map<string, ItemMetadataForReport>> {
    const rows = await this.db.getAllAsync<Record<string, unknown>>(
      `SELECT
        ib.item_key,
        ib.product_id,
        ib.variant_id,
        p.name AS product_name,
        p.sku AS product_sku,
        p.category_id,
        pv.variant_name,
        pv.sku AS variant_sku,
        c.name AS category_name,
        u.symbol AS unit_symbol
      FROM inventory_balances ib
      INNER JOIN products p ON p.id = ib.product_id
      LEFT JOIN product_variants pv ON pv.id = ib.variant_id
      INNER JOIN categories c ON c.id = p.category_id
      INNER JOIN units_of_measure u ON u.id = p.unit_id
      WHERE ib.workspace_id = ?`,
      [workspaceId]
    );

    const map = new Map<string, ItemMetadataForReport>();
    for (const r of rows) {
      const productName = String(r.product_name);
      const variantName = r.variant_name ? String(r.variant_name) : null;
      const itemKey = String(r.item_key);
      map.set(itemKey, {
        itemKey,
        productId: String(r.product_id),
        variantId: r.variant_id ? String(r.variant_id) : null,
        productName,
        variantName,
        displayName: variantName
          ? `${productName} (${variantName})`
          : productName,
        sku: r.variant_sku ? String(r.variant_sku) : String(r.product_sku),
        categoryId: String(r.category_id),
        categoryName: String(r.category_name),
        unitSymbol: String(r.unit_symbol),
      });
    }
    return map;
  }

  private async getItemDisplayMetadata(
    workspaceId: string,
    itemKey: string
  ): Promise<ItemMetadataForReport | null> {
    const map = await this.getItemsMetadataMap(workspaceId);
    return map.get(itemKey) ?? null;
  }
}
