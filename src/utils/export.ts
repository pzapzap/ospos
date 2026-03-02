// Generate CSV from orders, share/save
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getAllOrdersForExport, getAllOrdersForDateRange, type OrderWithItems } from '../db/queries';

// Sanitize string for CSV: escape quotes, strip newlines, prevent formula injection
function sanitizeCSVField(value: string): string {
  let sanitized = value.replace(/"/g, '""').replace(/[\n\r]/g, ' ');
  // Prevent CSV formula injection — prefix dangerous first characters
  if (/^[=+\-@\t\r]/.test(sanitized)) {
    sanitized = `'${sanitized}`;
  }
  return `"${sanitized}"`;
}

function orderToCSVRow(order: OrderWithItems): string {
  const date = new Date(order.created_at);
  const dateStr = date.toLocaleDateString();
  const timeStr = date.toLocaleTimeString();

  // Repeating item columns: item_1_name, item_1_qty, item_1_price, item_2_name, ...
  const itemParts: string[] = [];
  for (const item of order.items) {
    itemParts.push(
      sanitizeCSVField(item.item_name),
      String(item.quantity),
      (item.item_price / 100).toFixed(2)
    );
  }

  return [
    dateStr,
    timeStr,
    ...itemParts,
    (order.subtotal / 100).toFixed(2),
    (order.tax_amount / 100).toFixed(2),
    (order.tip_amount / 100).toFixed(2),
    (order.total / 100).toFixed(2),
    order.payment_method,
  ].join(',');
}

function buildCSVHeader(maxItems: number): string {
  const itemHeaders: string[] = [];
  for (let i = 1; i <= maxItems; i++) {
    itemHeaders.push(`item_${i}_name`, `item_${i}_qty`, `item_${i}_price`);
  }
  return ['date', 'time', ...itemHeaders, 'subtotal', 'tax', 'tip', 'total', 'payment_method'].join(',');
}

export async function generateCSV(dateStr: string, endDate?: string): Promise<string> {
  const orders = endDate
    ? await getAllOrdersForDateRange(dateStr, endDate)
    : await getAllOrdersForExport(dateStr);

  if (orders.length === 0) {
    return '';
  }

  const maxItems = Math.max(...orders.map((o) => o.items.length));
  const header = buildCSVHeader(maxItems);
  const rows = orders.map(orderToCSVRow);

  return [header, ...rows].join('\n');
}

export async function exportCSVToFile(dateStr: string, endDate?: string): Promise<string | null> {
  const csv = await generateCSV(dateStr, endDate);
  if (!csv) return null;

  const fileName = endDate
    ? `ospos-${dateStr}-to-${endDate}.csv`
    : `ospos-${dateStr}.csv`;
  const filePath = `${FileSystem.documentDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(filePath, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return filePath;
}

export async function shareCSV(dateStr: string, endDate?: string): Promise<void> {
  const filePath = await exportCSVToFile(dateStr, endDate);
  if (!filePath) return;

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(filePath, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
    });
  }
}

export function generateTextSummary(
  dateStr: string,
  totalSales: number,
  transactionCount: number,
  cashTotal: number,
  cardTotal: number,
  averageValue: number,
  currencySymbol: string
): string {
  return [
    `Sales Summary — ${dateStr}`,
    `Total Sales: ${currencySymbol}${(totalSales / 100).toFixed(2)}`,
    `Transactions: ${transactionCount}`,
    `Cash: ${currencySymbol}${(cashTotal / 100).toFixed(2)}`,
    `Card: ${currencySymbol}${(cardTotal / 100).toFixed(2)}`,
    `Average: ${currencySymbol}${(averageValue / 100).toFixed(2)}`,
  ].join('\n');
}
