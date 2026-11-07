import { formatDisplayDate } from '@/core/utils/dateUtils';
import { formatQuantity } from '@/core/utils/quantityMath';
import { StockEventWithDetails } from '@/data/repositories/SqliteInventoryRepository';
import { BusinessProfile, InventoryItemView } from '@/domain/entities';
import { QuantityProvenance, StockStatus } from '@/domain/enums';
import {
  ConsolidatedLowStockReportResult,
  DailyLowStockReportResult,
} from '@/domain/services/HistoricalReportEngine';

export function formatProvenanceLabel(provenance: QuantityProvenance): string {
  switch (provenance) {
    case 'PHYSICAL_COUNT':
      return 'Verified Physical Count';
    case 'CALCULATED_INWARD_ONLY':
      return 'Calculated Inward-Only Balance';
    case 'CARRIED_FORWARD':
      return 'Carried Forward Balance';
    case 'UNKNOWN':
    default:
      return 'No Baseline (Unknown)';
  }
}

export function formatStockStatusLabel(status: StockStatus): string {
  switch (status) {
    case 'IN_STOCK':
      return 'In Stock';
    case 'LOW_STOCK':
      return 'Low Stock';
    case 'OUT_OF_STOCK':
      return 'Out of Stock';
    case 'UNKNOWN':
    default:
      return 'No Baseline';
  }
}

function escapeCsvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvDocument(params: {
  business: BusinessProfile;
  reportTitle: string;
  dateRangeLabel: string;
  headers: string[];
  rows: (string | number | null)[][];
}): string {
  const { business, reportTitle, dateRangeLabel, headers, rows } = params;
  const generatedAt = new Date().toISOString();

  const metaRows = [
    ['Business Name', business.businessName],
    ['Business Type', business.businessType],
    ['Report Title', reportTitle],
    ['Date Range', dateRangeLabel],
    ['Generated At', generatedAt],
    [
      'Inventory Notice',
      'Inward-only & Physical Count model. No sales or outgoing transactions are tracked.',
    ],
    [],
    headers,
    ...rows,
  ];

  return metaRows
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
    .join('\n');
}

export function buildCurrentInventoryCsv(
  business: BusinessProfile,
  items: InventoryItemView[],
  reportTitle = 'Current Inventory Report'
): string {
  const headers = [
    'Product / Variant',
    'SKU',
    'Barcode',
    'Category',
    'Recorded Quantity',
    'Unit',
    'Minimum Threshold',
    'Reorder Quantity',
    'Stock Status',
    'Quantity Basis (Provenance)',
    'Last Physical Count Date',
  ];

  const rows = items.map((item) => [
    item.displayName,
    item.sku,
    item.barcode ?? '',
    item.categoryName,
    item.recordedQuantity !== null ? item.recordedQuantity : 'UNKNOWN',
    item.unitSymbol,
    item.minStockThreshold,
    item.reorderQuantity ?? '',
    formatStockStatusLabel(item.stockStatus),
    formatProvenanceLabel(item.quantityProvenance),
    formatDisplayDate(item.lastPhysicalCountDate, business.dateFormat),
  ]);

  return buildCsvDocument({
    business,
    reportTitle,
    dateRangeLabel: `As of ${new Date().toISOString().slice(0, 10)}`,
    headers,
    rows,
  });
}

export function buildDailyLowStockCsv(
  business: BusinessProfile,
  report: DailyLowStockReportResult
): string {
  const headers = [
    'Date',
    'Product / Variant',
    'SKU',
    'Category',
    'Recorded Quantity',
    'Minimum Threshold (Applicable on Date)',
    'Unit',
    'Stock Status',
    'Quantity Provenance',
    'Last Physical Count Date',
  ];

  const rows: (string | number | null)[][] = [];
  for (const day of report.days) {
    if (day.items.length === 0) {
      rows.push([
        day.date,
        'No low-stock items on this date',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ]);
    } else {
      for (const item of day.items) {
        rows.push([
          day.date,
          item.displayName,
          item.sku,
          item.categoryName,
          item.recordedQuantity !== null ? item.recordedQuantity : 'UNKNOWN',
          item.minStockThreshold,
          item.unitSymbol,
          formatStockStatusLabel(item.stockStatus),
          formatProvenanceLabel(item.quantitySource),
          item.lastPhysicalCountDate ?? 'Never',
        ]);
      }
    }
  }

  return buildCsvDocument({
    business,
    reportTitle: report.includeAllStatuses
      ? 'Daily Stock History Report'
      : 'Daily Low-Stock History Report',
    dateRangeLabel: `${report.startDate} to ${report.endDate} (Inclusive)`,
    headers,
    rows,
  });
}

export function buildConsolidatedLowStockCsv(
  business: BusinessProfile,
  report: ConsolidatedLowStockReportResult
): string {
  const headers = [
    'Product / Variant',
    'SKU',
    'Category',
    'Applicable Minimum Threshold',
    'Lowest Recorded Quantity',
    'Unit',
    'Low-Stock Days',
    'Out-of-Stock Days',
    'Total Affected Days',
    'First Low-Stock Date',
    'Last Low-Stock Date',
    'Latest Quantity Provenance',
  ];

  const rows = report.items.map((item) => [
    item.displayName,
    item.sku,
    item.categoryName,
    item.applicableThreshold,
    item.lowestRecordedQuantity,
    item.unitSymbol,
    item.lowStockDays,
    item.outOfStockDays,
    item.totalAffectedDays,
    item.firstLowStockDate,
    item.lastLowStockDate,
    formatProvenanceLabel(item.latestQuantitySource),
  ]);

  return buildCsvDocument({
    business,
    reportTitle: 'Consolidated Low-Stock Report',
    dateRangeLabel: `${report.startDate} to ${report.endDate} (Inclusive)`,
    headers,
    rows,
  });
}

export function buildStockEventsCsv(
  business: BusinessProfile,
  events: StockEventWithDetails[],
  reportTitle: string,
  dateRangeLabel: string
): string {
  const headers = [
    'Date',
    'Event Type',
    'Product / Variant',
    'SKU',
    'Category',
    'Entered Quantity / Delta',
    'Previous Balance',
    'Resulting Balance',
    'Physical Count Variance',
    'Unit',
    'Supplier',
    'Reference / Reason',
    'Notes',
  ];

  const rows = events.map((ev) => [
    ev.eventDate,
    ev.eventType,
    ev.displayName,
    ev.sku,
    ev.categoryName,
    ev.quantity,
    ev.previousBalance ?? 'None',
    ev.resultingBalance,
    ev.varianceQuantity ?? '',
    ev.unitSymbol,
    ev.supplierName ?? '',
    ev.referenceNumber || ev.reason || '',
    ev.notes ?? '',
  ]);

  return buildCsvDocument({
    business,
    reportTitle,
    dateRangeLabel,
    headers,
    rows,
  });
}

export function buildHtmlReportForPdf(params: {
  business: BusinessProfile;
  reportTitle: string;
  dateRangeLabel: string;
  headers: string[];
  rows: (string | number | null)[][];
}): string {
  const { business, reportTitle, dateRangeLabel, headers, rows } = params;
  const generatedAt = new Date().toLocaleString();

  const thHtml = headers.map((h) => `<th>${h}</th>`).join('');
  const trHtml =
    rows.length === 0
      ? `<tr><td colspan="${headers.length}" style="text-align:center;padding:18px;">No records found for the selected filter criteria.</td></tr>`
      : rows
          .map(
            (r) =>
              `<tr>${r
                .map((c) => `<td>${c === null || c === undefined ? '' : String(c)}</td>`)
                .join('')}</tr>`
          )
          .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${reportTitle}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0F172A; padding: 24px; font-size: 12px; }
          .header { border-bottom: 2px solid #2563EB; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; }
          .title { font-size: 20px; font-weight: 700; color: #1E3A8A; margin: 0 0 4px 0; }
          .subtitle { font-size: 13px; color: #475569; margin: 2px 0; }
          .notice { background: #F1F5F9; border-left: 4px solid #2563EB; padding: 8px 12px; margin-bottom: 16px; font-size: 11px; color: #334155; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th { background: #1E293B; color: #FFFFFF; text-align: left; padding: 8px; font-size: 11px; }
          td { border-bottom: 1px solid #E2E8F0; padding: 7px 8px; font-size: 11px; }
          tr:nth-child(even) td { background: #F8FAFC; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">${business.businessName}</h1>
            <p class="subtitle">${reportTitle}</p>
            <p class="subtitle">Period: <strong>${dateRangeLabel}</strong></p>
          </div>
          <div style="text-align: right;">
            <p class="subtitle">Business Type: ${business.businessType}</p>
            <p class="subtitle">Generated: ${generatedAt}</p>
          </div>
        </div>
        <div class="notice">
          <strong>Quantity Provenance Note:</strong> Balances marked "Calculated Inward-Only Balance" or "Carried Forward" are derived from opening stock and inward receipts without outgoing sales tracking. Balances marked "Verified Physical Count" reflect observed floor counts.
        </div>
        <table>
          <thead><tr>${thHtml}</tr></thead>
          <tbody>${trHtml}</tbody>
        </table>
      </body>
    </html>
  `;
}

/**
 * Exports a CSV or PDF report to the device file system and opens the native Share dialog
 * on Android/iOS, or triggers a direct file download / print window when testing on a laptop browser.
 */
export async function exportAndShareReportFile(params: {
  format: 'csv' | 'pdf';
  fileNamePrefix: string;
  csvContent: string;
  htmlContent: string;
}): Promise<{ fileUri: string; shared: boolean }> {
  const safePrefix = params.fileNamePrefix
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .toLowerCase();
  const timestamp = new Date().toISOString().slice(0, 10);

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (params.format === 'csv') {
      const filename = `${safePrefix}_${timestamp}.csv`;
      const url = `data:text/csv;charset=utf-8,${encodeURIComponent(
        params.csvContent
      )}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return { fileUri: filename, shared: true };
    } else {
      const printWin = window.open('', '_blank');
      if (printWin) {
        printWin.document.write(params.htmlContent);
        printWin.document.close();
        printWin.focus();
        printWin.print();
      }
      return { fileUri: `${safePrefix}_${timestamp}.pdf`, shared: true };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const FileSystem = require('expo-file-system');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Sharing = require('expo-sharing');

  if (params.format === 'pdf') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Print = require('expo-print');
    const { uri } = await Print.printToFileAsync({
      html: params.htmlContent,
    });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share Inventory PDF Report',
      });
    }
    return { fileUri: uri, shared: canShare };
  }

  const fileUri = `${FileSystem.documentDirectory}${safePrefix}_${timestamp}.csv`;
  await FileSystem.writeAsStringAsync(fileUri, params.csvContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'text/csv',
      dialogTitle: 'Share Inventory CSV Report',
    });
  }
  return { fileUri, shared: canShare };
}
