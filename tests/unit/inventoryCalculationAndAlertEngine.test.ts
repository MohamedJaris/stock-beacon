import {
  addQuantities,
  formatQuantity,
  subtractQuantities,
} from '@/core/utils/quantityMath';
import {
  calculateLedgerState,
  evaluateStockStatus,
} from '@/domain/services/InventoryCalculationEngine';
import { evaluateLowStockAlertTransition } from '@/domain/services/LowStockAlertEngine';

describe('Stock Calculation Engine & Low-Stock Rules (Mandatory Cases 7-23)', () => {
  test('Safe decimal arithmetic avoids IEEE-754 floating-point errors', () => {
    expect(addQuantities(0.1, 0.2)).toBe(0.3);
    expect(subtractQuantities(1.0, 0.9)).toBe(0.1);
    expect(formatQuantity(12.5, 'kg')).toBe('12.5 kg');
    expect(formatQuantity(null, 'pcs')).toBe('Unknown');
  });

  test('Cases 7-13: Chronological stock ledger calculation (Opening -> Inward -> Physical Count -> Inward)', () => {
    // Case 7: Add opening stock of 100 units
    // Case 8: Record inward stock of 50 units -> Case 9: Verify balance is 150
    const step1And2 = calculateLedgerState({
      workspaceId: 'ws-1',
      itemKey: 'prod-1',
      productId: 'prod-1',
      currentThreshold: 20,
      events: [
        {
          id: 'ev-1',
          eventType: 'OPENING_STOCK',
          quantity: 100,
          eventDate: '2026-11-01',
          sequenceNo: 1,
        },
        {
          id: 'ev-2',
          eventType: 'STOCK_INWARD',
          quantity: 50,
          eventDate: '2026-11-02',
          sequenceNo: 2,
        },
      ],
    });
    expect(step1And2.recordedQuantity).toBe(150);
    expect(step1And2.quantityProvenance).toBe('CALCULATED_INWARD_ONLY');

    // Case 10: Record a physical stock count of 120 -> Case 11: Verify balance becomes 120
    const step3 = calculateLedgerState({
      workspaceId: 'ws-1',
      itemKey: 'prod-1',
      productId: 'prod-1',
      currentThreshold: 20,
      events: [
        ...step1And2.processedEvents,
        {
          id: 'ev-3',
          eventType: 'PHYSICAL_COUNT',
          quantity: 120,
          eventDate: '2026-11-03',
          sequenceNo: 3,
        },
      ],
    });
    expect(step3.recordedQuantity).toBe(120);
    expect(step3.quantityProvenance).toBe('PHYSICAL_COUNT');
    expect(step3.lastPhysicalCountDate).toBe('2026-11-03');

    // Case 14: Verify a physical stock count is never represented as a sale
    const physicalCountEvent = step3.processedEvents[2];
    expect(physicalCountEvent.eventType).toBe('PHYSICAL_COUNT');
    expect(physicalCountEvent.varianceQuantity).toBe(-30);

    // Case 12: Record further inward stock of 30 -> Case 13: Verify balance becomes 150
    const step4 = calculateLedgerState({
      workspaceId: 'ws-1',
      itemKey: 'prod-1',
      productId: 'prod-1',
      currentThreshold: 20,
      events: [
        ...step3.processedEvents,
        {
          id: 'ev-4',
          eventType: 'STOCK_INWARD',
          quantity: 30,
          eventDate: '2026-11-04',
          sequenceNo: 4,
        },
      ],
    });
    expect(step4.recordedQuantity).toBe(150);
    expect(step4.quantityProvenance).toBe('CALCULATED_INWARD_ONLY');
    expect(step4.lastPhysicalCountDate).toBe('2026-11-03');
  });

  test('Case 15: Product without an opening or count baseline displays UNKNOWN rather than zero', () => {
    const noBaseline = calculateLedgerState({
      workspaceId: 'ws-1',
      itemKey: 'prod-no-base',
      productId: 'prod-no-base',
      currentThreshold: 20,
      events: [],
    });
    expect(noBaseline.recordedQuantity).toBeNull();
    expect(noBaseline.stockStatus).toBe('UNKNOWN');
    expect(noBaseline.quantityProvenance).toBe('UNKNOWN');
  });

  test('Cases 16-20: Minimum stock threshold status comparison rules', () => {
    // Case 16: Minimum threshold is 20 and quantity is 30 -> IN_STOCK
    expect(evaluateStockStatus(30, 20)).toBe('IN_STOCK');

    // Case 17: Minimum threshold is 20 and quantity is 20 -> LOW_STOCK
    expect(evaluateStockStatus(20, 20)).toBe('LOW_STOCK');

    // Case 18: Minimum threshold is 20 and quantity is 19 -> LOW_STOCK
    expect(evaluateStockStatus(19, 20)).toBe('LOW_STOCK');

    // Case 19: Quantity is zero -> OUT_OF_STOCK
    expect(evaluateStockStatus(0, 20)).toBe('OUT_OF_STOCK');

    // Case 20: Quantity is unknown -> UNKNOWN
    expect(evaluateStockStatus(null, 20)).toBe('UNKNOWN');
  });

  test('Cases 21-23: Low-stock alert transition state machine (no duplicates on repeated visits, reset on restock, threshold change re-evaluates)', () => {
    // Initial move from IN_STOCK ('NONE') to LOW_STOCK emits alert
    const firstLow = evaluateLowStockAlertTransition({
      itemDisplayName: 'A4 Paper',
      unitSymbol: 'packs',
      recordedQuantity: 12,
      minStockThreshold: 20,
      newStatus: 'LOW_STOCK',
      previousAlertState: 'NONE',
    });
    expect(firstLow.shouldEmitNotification).toBe(true);
    expect(firstLow.newAlertState).toBe('LOW_STOCK_ALERTED');

    // Case 21: Repeated dashboard visits / re-evaluations while still LOW_STOCK do NOT emit duplicate alerts
    const secondVisit = evaluateLowStockAlertTransition({
      itemDisplayName: 'A4 Paper',
      unitSymbol: 'packs',
      recordedQuantity: 12,
      minStockThreshold: 20,
      newStatus: 'LOW_STOCK',
      previousAlertState: firstLow.newAlertState,
    });
    expect(secondVisit.shouldEmitNotification).toBe(false);
    expect(secondVisit.newAlertState).toBe('LOW_STOCK_ALERTED');

    // Case 22: Restocking above threshold resets the low-stock alert state to NONE
    const restocked = evaluateLowStockAlertTransition({
      itemDisplayName: 'A4 Paper',
      unitSymbol: 'packs',
      recordedQuantity: 45,
      minStockThreshold: 20,
      newStatus: 'IN_STOCK',
      previousAlertState: secondVisit.newAlertState,
    });
    expect(restocked.shouldEmitNotification).toBe(false);
    expect(restocked.newAlertState).toBe('NONE');

    // Case 23: Raising the minimum threshold from 20 to 50 causes quantity 45 to enter LOW_STOCK and emit a new alert
    const newStatusAfterThresholdRaise = evaluateStockStatus(45, 50);
    expect(newStatusAfterThresholdRaise).toBe('LOW_STOCK');

    const thresholdTransition = evaluateLowStockAlertTransition({
      itemDisplayName: 'A4 Paper',
      unitSymbol: 'packs',
      recordedQuantity: 45,
      minStockThreshold: 50,
      newStatus: newStatusAfterThresholdRaise,
      previousAlertState: restocked.newAlertState,
    });
    expect(thresholdTransition.shouldEmitNotification).toBe(true);
    expect(thresholdTransition.newAlertState).toBe('LOW_STOCK_ALERTED');
  });
});
