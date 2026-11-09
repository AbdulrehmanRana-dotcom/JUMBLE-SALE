import { Platform } from 'react-native';
import type { Brand, Deal } from '@/types/database.types';

/**
 * Escapes a single CSV value compliant with RFC 4180
 */
function escapeCsvValue(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Initiates browser download of a CSV file or copies content
 */
export function downloadCsvFile(filename: string, csvContent: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Generates and downloads a CSV report of registered brands
 */
export function exportBrandsToCsv(brands: (Brand | any)[]) {
  const headers = ['ID', 'Brand Name', 'Business Email', 'Contact Number', 'Category', 'City', 'Status', 'Is Verified', 'Created Date'];
  const rows = brands.map((b) => [
    escapeCsvValue(b.id),
    escapeCsvValue(b.name),
    escapeCsvValue(b.business_email),
    escapeCsvValue(b.contact_number || b.phone || ''),
    escapeCsvValue(b.category || ''),
    escapeCsvValue(b.city || 'All Pakistan'),
    escapeCsvValue(b.status || 'active'),
    escapeCsvValue(b.is_verified ? 'Yes' : 'No'),
    escapeCsvValue(b.created_at || ''),
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadCsvFile(`jumble_sale_brands_${dateStr}.csv`, csv);
}

/**
 * Generates and downloads a CSV report of published deals & sales
 */
export function exportDealsToCsv(deals: (Deal | any)[]) {
  const headers = [
    'Deal ID',
    'Deal Title',
    'Brand Name',
    'Category',
    'Discount %',
    'Original Price (PKR)',
    'Discount Price (PKR)',
    'Deal Type',
    'City',
    'Status',
    'Is Featured',
    'Buy URL',
    'Start Date',
    'End Date',
  ];

  const rows = deals.map((d) => [
    escapeCsvValue(d.id),
    escapeCsvValue(d.title),
    escapeCsvValue(d.brand_name || d.brand?.name || ''),
    escapeCsvValue(d.category?.name || d.brand?.category || ''),
    escapeCsvValue(d.discount_pct || 0),
    escapeCsvValue(d.original_price || ''),
    escapeCsvValue(d.discount_price || ''),
    escapeCsvValue(d.deal_type || 'online'),
    escapeCsvValue(d.city || 'All Pakistan'),
    escapeCsvValue(d.status || 'active'),
    escapeCsvValue(d.is_pinned ? 'Yes' : 'No'),
    escapeCsvValue(d.buy_url || d.website_url || ''),
    escapeCsvValue(d.start_date || ''),
    escapeCsvValue(d.end_date || ''),
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadCsvFile(`jumble_sale_deals_${dateStr}.csv`, csv);
}

/**
 * Generates and downloads a CSV report of attributed shopping orders & GMV
 */
export function exportOrdersToCsv(orders: any[]) {
  const headers = [
    'Order ID',
    'Deal Title',
    'Brand Name',
    'Order Amount (PKR)',
    'Savings Amount (PKR)',
    'Order Reference',
    'Status',
    'Attribution Method',
    'Created At',
  ];

  const rows = orders.map((o) => [
    escapeCsvValue(o.id),
    escapeCsvValue(o.deal_title || ''),
    escapeCsvValue(o.brand_name || ''),
    escapeCsvValue(o.order_amount || 0),
    escapeCsvValue(o.savings_amount || 0),
    escapeCsvValue(o.order_reference || ''),
    escapeCsvValue(o.status || 'confirmed'),
    escapeCsvValue(o.attribution_method || 'in_app_webview'),
    escapeCsvValue(o.created_at || ''),
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadCsvFile(`jumble_sale_orders_${dateStr}.csv`, csv);
}
