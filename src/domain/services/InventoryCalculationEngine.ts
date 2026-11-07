import {
  addQuantities,
  compareQuantities,
  isQuantityLessOrEqual,
  isQuantityZero,
  normalizeQuantity,
  subtractQuantities,
} from '@/core/utils/quantityMath';
import { getInclusiveDateRange } from '@/core/utils/dateUtils';
import { generateId } from '@/core/utils/skuGenerator';
import {
  DailyInventorySnapshot,
  ProductThresholdHistory,
  StockEvent,
} from '../entities';
import { QuantityProvenance, StockEventType, StockStatus } from '../enums';

export interface LedgerEventInput {
  id?: string;
  eventType: StockEventType;
  quantity: number;
  eventDate: string; // YYYY-MM-DD
  eventTimestamp?: string;
  sequenceNo?: number;
  supplierId?: string | null;
  referenceNumber?: string | null;
  reason?: string | null;
  notes?: string | null;
}

export interface ComputedLedgerState {
  recordedQuantity: number | null;
  quantityProvenance: QuantityProvenance;
  stockStatus: StockStatus;
  lastPhysicalCountDate: string | null;
  lastPhysicalCountQty: number | null;
  lastInwardDate: string | null;
  lastEventId: string | null;
  processedEvents: StockEvent[];
}

/**
 * Authoritative Stock Status Evaluation Rule:
 * - If quantity is null (no baseline): UNKNOWN
 * - If quantity === 0: OUT_OF_STOCK
 * - If 0 < quantity <= minStockThreshold: LOW_STOCK
 * - If quantity > minStockThreshold: IN_STOCK
 */
export function evaluateStockStatus(
  recordedQuantity: number | null | undefined,
  minStockThreshold: number
): StockStatus {
  if (minStockThreshold < 0 || Number.isNaN(minStockThreshold)) {
    throw new Error(`Minimum stock threshold cannot be negative: ${minStockThreshold}`);
  }
  if (recordedQuantity === null || recordedQuantity === undefined || Number.isNaN(recordedQuantity)) {
    return 'UNKNOWN';
  }
  if (isQuantityZero(recordedQuantity)) {
    return 'OUT_OF_STOCK';
  }
  if (
    compareQuantities(recordedQuantity, 0) > 0 &&
    isQuantityLessOrEqual(recordedQuantity, minStockThreshold)
  ) {
    return 'LOW_STOCK';
  }
  return 'IN_STOCK';
}

/**
 * Sorts stock events chronologically by (eventDate ASC, sequenceNo ASC, eventTimestamp ASC).
 */
export function sortStockEventsChronologically<
  T extends { eventDate: string; sequenceNo?: number; eventTimestamp?: string }
>(events: T[]): T[] {
  return [...events].sort((a, b) => {
    if (a.eventDate !== b.eventDate) {
      return a.eventDate < b.eventDate ? -1 : 1;
    }
    const seqA = a.sequenceNo ?? 0;
    const seqB = b.sequenceNo ?? 0;
    if (seqA !== seqB) {
      return seqA - seqB;
    }
    const tsA = a.eventTimestamp ?? '';
    const tsB = b.eventTimestamp ?? '';
    return tsA.localeCompare(tsB);
  });
}

/**
 * Resolves the applicable minimum stock threshold on a given YYYY-MM-DD date
 * from the item's threshold change history.
 */
export function resolveHistoricalThresholdOnDate(
  dateStr: string,
  thresholdHistory: ProductThresholdHistory[],
  fallbackThreshold = 0
): number {
  if (!thresholdHistory || thresholdHistory.length === 0) {
    return normalizeQuantity(fallbackThreshold);
  }

  const sorted = [...thresholdHistory].sort((a, b) => {
    if (a.effectiveFromDate !== b.effectiveFromDate) {
      return a.effectiveFromDate < b.effectiveFromDate ? -1 : 1;
    }
    return a.sequenceNo - b.sequenceNo;
  });

  let applicable = sorted[0].minStockThreshold;
  for (const record of sorted) {
    if (record.effectiveFromDate <= dateStr) {
      applicable = record.minStockThreshold;
    } else {
      break;
    }
  }
  return normalizeQuantity(applicable);
}

/**
 * Processes an ordered sequence of stock events for a single item (product or variant)
 * and computes the resulting balance, provenance, and enriched ledger records.
 *
 * CRITICAL INVARIANTS:
 * 1. Only OPENING_STOCK, STOCK_INWARD, PHYSICAL_COUNT, and STOCK_ADJUSTMENT are valid.
 * 2. If no events exist (or no baseline exists), recordedQuantity is null and status is UNKNOWN.
 * 3. PHYSICAL_COUNT resets the balance to the observed count and records varianceQuantity,
 *    never classifying the difference as a sale.
 */
export function calculateLedgerState(
  params: {
    workspaceId: string;
    warehouseId?: string | null;
    itemKey: string;
    productId: string;
    variantId?: string | null;
    currentThreshold: number;
    events: LedgerEventInput[];
  }
): ComputedLedgerState {
  const {
    workspaceId,
    warehouseId = null,
    itemKey,
    productId,
    variantId = null,
    currentThreshold,
    events,
  } = params;

  const sortedInputs = sortStockEventsChronologically(events);

  let balance: number | null = null;
  let provenance: QuantityProvenance = 'UNKNOWN';
  let lastPhysicalCountDate: string | null = null;
  let lastPhysicalCountQty: number | null = null;
  let lastInwardDate: string | null = null;
  let lastEventId: string | null = null;

  const processedEvents: StockEvent[] = [];

  sortedInputs.forEach((input, idx) => {
    const previousBalance = balance;
    const rawQty = normalizeQuantity(input.quantity);
    let resultingBalance = 0;
    let varianceQuantity: number | null = null;

    switch (input.eventType) {
      case 'OPENING_STOCK': {
        if (rawQty < 0) {
          throw new Error('Opening stock quantity cannot be negative.');
        }
        resultingBalance = rawQty;
        balance = resultingBalance;
        provenance = 'CALCULATED_INWARD_ONLY';
        break;
      }

      case 'STOCK_INWARD': {
        if (rawQty <= 0) {
          throw new Error('Stock inward quantity must be greater than zero.');
        }
        const base = balance ?? 0;
        resultingBalance = addQuantities(base, rawQty);
        balance = resultingBalance;
        provenance = 'CALCULATED_INWARD_ONLY';
        lastInwardDate = input.eventDate;
        break;
      }

      case 'PHYSICAL_COUNT': {
        if (rawQty < 0) {
          throw new Error('Physical stock count cannot be negative.');
        }
        resultingBalance = rawQty;
        varianceQuantity =
          previousBalance !== null
            ? subtractQuantities(resultingBalance, previousBalance)
            : null;
        balance = resultingBalance;
        provenance = 'PHYSICAL_COUNT';
        lastPhysicalCountDate = input.eventDate;
        lastPhysicalCountQty = resultingBalance;
        break;
      }

      case 'STOCK_ADJUSTMENT': {
        if (rawQty === 0) {
          throw new Error('Stock adjustment quantity difference cannot be zero.');
        }
        const base = balance ?? 0;
        const adjusted = addQuantities(base, rawQty);
        if (adjusted < 0) {
          throw new Error(
            `Stock adjustment (${rawQty}) would result in a negative balance (${adjusted}).`
          );
        }
        resultingBalance = adjusted;
        balance = resultingBalance;
        provenance = 'CALCULATED_INWARD_ONLY';
        break;
      }

      default: {
        const exhaustiveCheck: never = input.eventType;
        throw new Error(`Unsupported stock event type: ${String(exhaustiveCheck)}`);
      }
    }

    const eventId = input.id ?? generateId();
    const timestamp = input.eventTimestamp ?? new Date().toISOString();
    lastEventId = eventId;

    processedEvents.push({
      id: eventId,
      workspaceId,
      warehouseId,
      itemKey,
      productId,
      variantId,
      eventType: input.eventType,
      quantity: rawQty,
      previousBalance,
      resultingBalance,
      varianceQuantity,
      eventDate: input.eventDate,
      eventTimestamp: timestamp,
      sequenceNo: input.sequenceNo ?? idx + 1,
      supplierId: input.supplierId ?? null,
      referenceNumber: input.referenceNumber ?? null,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      createdAt: timestamp,
    });
  });

  const stockStatus = evaluateStockStatus(balance, currentThreshold);

  return {
    recordedQuantity: balance,
    quantityProvenance: provenance,
    stockStatus,
    lastPhysicalCountDate,
    lastPhysicalCountQty,
    lastInwardDate,
    lastEventId,
    processedEvents,
  };
}

/**
 * Deterministically builds DailyInventorySnapshot records for a given inclusive [startDate, endDate] range
 * from the item's stock event ledger and historical threshold records.
 *
 * Rules enforced:
 * - Before any baseline event exists, recordedQuantity = null, stockStatus = UNKNOWN, quantitySource = UNKNOWN.
 * - On a date where one or more events occurred:
 *   - If the latest event on that date is PHYSICAL_COUNT, quantitySource = PHYSICAL_COUNT.
 *   - Otherwise, quantitySource = CALCULATED_INWARD_ONLY.
 * - On a date where NO events occurred, but a baseline existed on an earlier date:
 *   - recordedQuantity is carried forward from the previous day, and quantitySource = CARRIED_FORWARD.
 * - Applicable threshold is resolved for EACH calendar date from thresholdHistory, so historical thresholds are preserved.
 */
export function buildDailyInventorySnapshots(params: {
  workspaceId: string;
  itemKey: string;
  productId: string;
  variantId?: string | null;
  startDate: string;
  endDate: string;
  events: StockEvent[];
  thresholdHistory: ProductThresholdHistory[];
  fallbackThreshold?: number;
  generatedAt?: string;
}): DailyInventorySnapshot[] {
  const {
    workspaceId,
    itemKey,
    productId,
    variantId = null,
    startDate,
    endDate,
    events,
    thresholdHistory,
    fallbackThreshold = 0,
    generatedAt = new Date().toISOString(),
  } = params;

  const sortedEvents = sortStockEventsChronologically(events);
  const dates = getInclusiveDateRange(startDate, endDate);

  // Pre-advance through any events strictly prior to startDate
  let eventCursor = 0;
  let runningBalance: number | null = null;
  let lastPhysicalCountDate: string | null = null;

  while (
    eventCursor < sortedEvents.length &&
    sortedEvents[eventCursor].eventDate < startDate
  ) {
    const ev = sortedEvents[eventCursor];
    runningBalance = ev.resultingBalance;
    if (ev.eventType === 'PHYSICAL_COUNT') {
      lastPhysicalCountDate = ev.eventDate;
    }
    eventCursor++;
  }

  const snapshots: DailyInventorySnapshot[] = [];

  for (const dateStr of dates) {
    const dayEvents: StockEvent[] = [];
    while (
      eventCursor < sortedEvents.length &&
      sortedEvents[eventCursor].eventDate === dateStr
    ) {
      const ev = sortedEvents[eventCursor];
      dayEvents.push(ev);
      runningBalance = ev.resultingBalance;
      if (ev.eventType === 'PHYSICAL_COUNT') {
        lastPhysicalCountDate = ev.eventDate;
      }
      eventCursor++;
    }

    let quantitySource: QuantityProvenance = 'UNKNOWN';
    if (runningBalance === null) {
      quantitySource = 'UNKNOWN';
    } else if (dayEvents.length > 0) {
      const lastEventOfDay = dayEvents[dayEvents.length - 1];
      quantitySource =
        lastEventOfDay.eventType === 'PHYSICAL_COUNT'
          ? 'PHYSICAL_COUNT'
          : 'CALCULATED_INWARD_ONLY';
    } else {
      quantitySource = 'CARRIED_FORWARD';
    }

    const applicableThreshold = resolveHistoricalThresholdOnDate(
      dateStr,
      thresholdHistory,
      fallbackThreshold
    );
    const stockStatus = evaluateStockStatus(runningBalance, applicableThreshold);

    snapshots.push({
      id: `${itemKey}:${dateStr}`,
      workspaceId,
      itemKey,
      productId,
      variantId,
      snapshotDate: dateStr,
      recordedQuantity: runningBalance,
      minStockThreshold: applicableThreshold,
      stockStatus,
      quantitySource,
      lastPhysicalCountDate,
      generatedAt,
    });
  }

  return snapshots;
}
