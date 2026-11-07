import { formatQuantity } from '@/core/utils/quantityMath';
import { AlertState, NotificationType, StockStatus } from '../enums';

export interface AlertTransitionEvaluation {
  newAlertState: AlertState;
  shouldEmitNotification: boolean;
  notificationType: NotificationType | null;
  title: string | null;
  message: string | null;
}

/**
 * Evaluates whether a stock status transition should emit a new alert notification.
 *
 * Rules:
 * - When status is IN_STOCK or UNKNOWN -> resets activeAlertState to 'NONE'. No alert.
 * - When status is LOW_STOCK:
 *   - If previousAlertState !== 'LOW_STOCK_ALERTED', emits LOW_STOCK_ALERT and sets state to 'LOW_STOCK_ALERTED'.
 *   - If already 'LOW_STOCK_ALERTED', does NOT emit a duplicate alert (e.g., on repeated dashboard visits).
 * - When status is OUT_OF_STOCK:
 *   - If previousAlertState !== 'OUT_OF_STOCK_ALERTED', emits OUT_OF_STOCK_ALERT and sets state to 'OUT_OF_STOCK_ALERTED'.
 *   - If already 'OUT_OF_STOCK_ALERTED', does NOT emit a duplicate alert.
 */
export function evaluateLowStockAlertTransition(params: {
  itemDisplayName: string;
  unitSymbol: string;
  recordedQuantity: number | null;
  minStockThreshold: number;
  newStatus: StockStatus;
  previousAlertState: AlertState;
  lowStockAlertsEnabled?: boolean;
  outOfStockAlertsEnabled?: boolean;
}): AlertTransitionEvaluation {
  const {
    itemDisplayName,
    unitSymbol,
    recordedQuantity,
    minStockThreshold,
    newStatus,
    previousAlertState,
    lowStockAlertsEnabled = true,
    outOfStockAlertsEnabled = true,
  } = params;

  if (newStatus === 'IN_STOCK' || newStatus === 'UNKNOWN') {
    return {
      newAlertState: 'NONE',
      shouldEmitNotification: false,
      notificationType: null,
      title: null,
      message: null,
    };
  }

  if (newStatus === 'OUT_OF_STOCK') {
    if (previousAlertState === 'OUT_OF_STOCK_ALERTED') {
      return {
        newAlertState: 'OUT_OF_STOCK_ALERTED',
        shouldEmitNotification: false,
        notificationType: null,
        title: null,
        message: null,
      };
    }

    return {
      newAlertState: 'OUT_OF_STOCK_ALERTED',
      shouldEmitNotification: outOfStockAlertsEnabled,
      notificationType: outOfStockAlertsEnabled ? 'OUT_OF_STOCK_ALERT' : null,
      title: outOfStockAlertsEnabled ? `Out of Stock: ${itemDisplayName}` : null,
      message: outOfStockAlertsEnabled
        ? `${itemDisplayName} has reached 0 ${unitSymbol} (Minimum threshold: ${formatQuantity(
            minStockThreshold,
            unitSymbol
          )}). Replenishment required.`
        : null,
    };
  }

  // newStatus === 'LOW_STOCK'
  if (previousAlertState === 'LOW_STOCK_ALERTED') {
    return {
      newAlertState: 'LOW_STOCK_ALERTED',
      shouldEmitNotification: false,
      notificationType: null,
      title: null,
      message: null,
    };
  }

  return {
    newAlertState: 'LOW_STOCK_ALERTED',
    shouldEmitNotification: lowStockAlertsEnabled,
    notificationType: lowStockAlertsEnabled ? 'LOW_STOCK_ALERT' : null,
    title: lowStockAlertsEnabled ? `Low Stock Alert: ${itemDisplayName}` : null,
    message: lowStockAlertsEnabled
      ? `${itemDisplayName} is at ${formatQuantity(
          recordedQuantity,
          unitSymbol
        )}, which is at or below its minimum threshold of ${formatQuantity(
          minStockThreshold,
          unitSymbol
        )}.`
      : null,
  };
}
