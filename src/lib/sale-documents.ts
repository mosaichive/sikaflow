import { formatCurrency } from '@/lib/constants';

export type SaleDocumentKind = 'invoice' | 'receipt';
export type SalePaymentStatus = 'paid' | 'partial' | 'unpaid';

export type SaleDocumentItem = {
  product_name: string;
  sku?: string | null;
  size?: string | null;
  color?: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type SaleDocumentSnapshot = {
  business: {
    name: string;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
  };
  customer: {
    name: string;
    phone?: string | null;
  };
  sale: {
    sale_date: string;
    payment_status: SalePaymentStatus;
    amount_ghs: number;
    amount_paid_ghs: number;
    balance_ghs: number;
    payment_method?: string | null;
    notes?: string | null;
  };
  seller: {
    name: string;
    email?: string | null;
  };
  items: SaleDocumentItem[];
};

export type SaleDocumentRecord = {
  id: string;
  sale_id: string;
  kind: SaleDocumentKind;
  document_number: string;
  sale_date: string;
  payment_status: SalePaymentStatus;
  amount_ghs: number;
  amount_paid_ghs: number;
  balance_ghs: number;
  customer_name: string;
  customer_phone?: string | null;
  seller_name?: string | null;
  issued_at: string;
  created_at: string;
  updated_at?: string;
  snapshot: SaleDocumentSnapshot;
};

type BusinessLike = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
};

type SaleLike = {
  sale_date?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  total?: number | string | null;
  amount_paid?: number | string | null;
  balance?: number | string | null;
  notes?: string | null;
  staff_name?: string | null;
};

type SaleItemLike = {
  product_name?: string | null;
  sku?: string | null;
  size?: string | null;
  color?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  line_total?: number | string | null;
};

function numberValue(value: number | string | null | undefined) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function saleDocumentLabel(kind: SaleDocumentKind) {
  return kind === 'invoice' ? 'Invoice' : 'Receipt';
}

export function salePaymentLabel(status: SalePaymentStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function buildSaleDocumentSnapshot({
  business,
  sale,
  items,
  issuedBy,
}: {
  business: BusinessLike | null;
  sale: SaleLike;
  items: SaleItemLike[];
  issuedBy: { name: string; email?: string | null };
}): SaleDocumentSnapshot {
  return {
    business: {
      name: stringValue(business?.name, 'SikaFlow Business'),
      email: business?.email ?? null,
      phone: business?.phone ?? null,
      location: business?.location ?? null,
    },
    customer: {
      name: stringValue(sale.customer_name, 'Walk-in'),
      phone: sale.customer_phone ?? null,
    },
    sale: {
      sale_date: stringValue(sale.sale_date, new Date().toISOString()),
      payment_status: (sale.payment_status === 'partial' || sale.payment_status === 'unpaid' ? sale.payment_status : 'paid') as SalePaymentStatus,
      amount_ghs: numberValue(sale.total),
      amount_paid_ghs: numberValue(sale.amount_paid),
      balance_ghs: numberValue(sale.balance),
      payment_method: sale.payment_method ?? null,
      notes: sale.notes ?? null,
    },
    seller: {
      name: stringValue(issuedBy.name, 'SikaFlow User'),
      email: issuedBy.email ?? null,
    },
    items: items.map((item) => ({
      product_name: stringValue(item.product_name, 'Line item'),
      sku: item.sku ?? null,
      size: item.size ?? null,
      color: item.color ?? null,
      quantity: numberValue(item.quantity),
      unit_price: numberValue(item.unit_price),
      line_total: numberValue(item.line_total),
    })),
  };
}

export function normalizeSaleDocument(row: any): SaleDocumentRecord {
  const snapshot = (row?.snapshot ?? {}) as Partial<SaleDocumentSnapshot>;
  const normalizedSnapshot: SaleDocumentSnapshot = {
    business: {
      name: stringValue(snapshot.business?.name, 'SikaFlow Business'),
      email: snapshot.business?.email ?? null,
      phone: snapshot.business?.phone ?? null,
      location: snapshot.business?.location ?? null,
    },
    customer: {
      name: stringValue(snapshot.customer?.name, stringValue(row?.customer_name, 'Walk-in')),
      phone: snapshot.customer?.phone ?? row?.customer_phone ?? null,
    },
    sale: {
      sale_date: stringValue(snapshot.sale?.sale_date, row?.sale_date ?? row?.issued_at ?? new Date().toISOString()),
      payment_status: ((snapshot.sale?.payment_status ?? row?.payment_status ?? 'paid') as SalePaymentStatus),
      amount_ghs: numberValue(snapshot.sale?.amount_ghs ?? row?.amount_ghs),
      amount_paid_ghs: numberValue(snapshot.sale?.amount_paid_ghs ?? row?.amount_paid_ghs),
      balance_ghs: numberValue(snapshot.sale?.balance_ghs ?? row?.balance_ghs),
      payment_method: snapshot.sale?.payment_method ?? null,
      notes: snapshot.sale?.notes ?? null,
    },
    seller: {
      name: stringValue(snapshot.seller?.name, row?.seller_name ?? 'SikaFlow User'),
      email: snapshot.seller?.email ?? null,
    },
    items: Array.isArray(snapshot.items)
      ? snapshot.items.map((item) => ({
          product_name: stringValue(item?.product_name, 'Line item'),
          sku: item?.sku ?? null,
          size: item?.size ?? null,
          color: item?.color ?? null,
          quantity: numberValue(item?.quantity),
          unit_price: numberValue(item?.unit_price),
          line_total: numberValue(item?.line_total),
        }))
      : [],
  };

  return {
    id: String(row?.id ?? ''),
    sale_id: String(row?.sale_id ?? ''),
    kind: row?.kind === 'receipt' ? 'receipt' : 'invoice',
    document_number: stringValue(row?.document_number, 'Pending'),
    sale_date: stringValue(row?.sale_date, normalizedSnapshot.sale.sale_date),
    payment_status: normalizedSnapshot.sale.payment_status,
    amount_ghs: numberValue(row?.amount_ghs ?? normalizedSnapshot.sale.amount_ghs),
    amount_paid_ghs: numberValue(row?.amount_paid_ghs ?? normalizedSnapshot.sale.amount_paid_ghs),
    balance_ghs: numberValue(row?.balance_ghs ?? normalizedSnapshot.sale.balance_ghs),
    customer_name: normalizedSnapshot.customer.name,
    customer_phone: normalizedSnapshot.customer.phone,
    seller_name: normalizedSnapshot.seller.name,
    issued_at: stringValue(row?.issued_at, row?.created_at ?? new Date().toISOString()),
    created_at: stringValue(row?.created_at, row?.issued_at ?? new Date().toISOString()),
    updated_at: row?.updated_at ? String(row.updated_at) : undefined,
    snapshot: normalizedSnapshot,
  };
}

export function saleDocumentFileName(document: SaleDocumentRecord) {
  return `${document.document_number.toLowerCase()}-${document.customer_name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'customer'}.html`;
}

function paymentTone(status: SalePaymentStatus) {
  if (status === 'paid') return '#0f766e';
  if (status === 'partial') return '#b45309';
  return '#b91c1c';
}

function paymentMethodLabel(value?: string | null) {
  if (!value) return 'Not specified';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function renderSaleDocumentHtml(document: SaleDocumentRecord) {
  const { snapshot } = document;
  const title = saleDocumentLabel(document.kind);
  const saleDate = new Date(snapshot.sale.sale_date).toLocaleDateString('en-GH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const issuedAt = new Date(document.issued_at).toLocaleString('en-GH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const rows = snapshot.items.map((item) => `
    <tr>
      <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;">
        <div style="font-weight:600;">${escapeHtml(item.product_name)}</div>
        <div style="font-size:12px;color:#6b7280;">
          ${[item.sku, item.size, item.color].filter(Boolean).map((part) => escapeHtml(String(part))).join(' • ') || '&nbsp;'}
        </div>
      </td>
      <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.quantity}</td>
      <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(formatCurrency(item.unit_price))}</td>
      <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${escapeHtml(formatCurrency(item.line_total))}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)} ${escapeHtml(document.document_number)}</title>
    <style>
      body { font-family: Inter, Arial, sans-serif; margin: 0; padding: 32px; color: #111827; background: #ffffff; }
      .sheet { max-width: 860px; margin: 0 auto; }
      .eyebrow { color: #9f1239; font-size: 12px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; }
      .heading { display:flex; justify-content:space-between; gap:24px; align-items:flex-start; margin-top: 14px; margin-bottom: 28px; }
      .title { font-size: 34px; line-height: 1.05; font-weight: 800; margin: 0; }
      .meta-grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-bottom: 24px; }
      .panel { border:1px solid #e5e7eb; border-radius: 18px; padding: 18px; }
      .panel h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin:0 0 10px; }
      .line { margin: 4px 0; font-size: 14px; }
      .summary { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 18px 0 24px; }
      .metric { border:1px solid #e5e7eb; border-radius: 16px; padding: 14px 16px; }
      .metric .label { color:#6b7280; font-size:12px; margin-bottom:6px; }
      .metric .value { font-size: 18px; font-weight: 700; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      thead th { text-align:left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; padding: 0 10px 10px; }
      .status { display:inline-flex; align-items:center; padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; background: rgba(159, 18, 57, 0.08); color: ${paymentTone(document.payment_status)}; }
      .footer { margin-top: 30px; padding-top: 18px; border-top:1px solid #e5e7eb; color:#6b7280; font-size: 12px; display:flex; justify-content:space-between; gap:16px; }
      @media print {
        body { padding: 0; }
        .sheet { max-width: none; }
      }
      @media (max-width: 720px) {
        body { padding: 18px; }
        .heading, .footer { flex-direction: column; }
        .meta-grid, .summary { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="eyebrow">${escapeHtml(title)}</div>
      <div class="heading">
        <div>
          <h1 class="title">${escapeHtml(snapshot.business.name)}</h1>
          <div class="line">${escapeHtml(title)} No. ${escapeHtml(document.document_number)}</div>
        </div>
        <div style="text-align:right;">
          <div class="line"><strong>Sale date:</strong> ${escapeHtml(saleDate)}</div>
          <div class="line"><strong>Issued:</strong> ${escapeHtml(issuedAt)}</div>
          <div class="line"><span class="status">${escapeHtml(salePaymentLabel(document.payment_status))}</span></div>
        </div>
      </div>

      <div class="meta-grid">
        <div class="panel">
          <h3>Business</h3>
          <div class="line">${escapeHtml(snapshot.business.name)}</div>
          ${snapshot.business.email ? `<div class="line">${escapeHtml(snapshot.business.email)}</div>` : ''}
          ${snapshot.business.phone ? `<div class="line">${escapeHtml(snapshot.business.phone)}</div>` : ''}
          ${snapshot.business.location ? `<div class="line">${escapeHtml(snapshot.business.location)}</div>` : ''}
        </div>
        <div class="panel">
          <h3>Customer</h3>
          <div class="line">${escapeHtml(snapshot.customer.name)}</div>
          ${snapshot.customer.phone ? `<div class="line">${escapeHtml(snapshot.customer.phone)}</div>` : ''}
          <div class="line"><strong>Seller:</strong> ${escapeHtml(snapshot.seller.name)}</div>
          ${snapshot.seller.email ? `<div class="line">${escapeHtml(snapshot.seller.email)}</div>` : ''}
        </div>
      </div>

      <div class="summary">
        <div class="metric">
          <div class="label">Total</div>
          <div class="value">${escapeHtml(formatCurrency(snapshot.sale.amount_ghs))}</div>
        </div>
        <div class="metric">
          <div class="label">Amount paid</div>
          <div class="value">${escapeHtml(formatCurrency(snapshot.sale.amount_paid_ghs))}</div>
        </div>
        <div class="metric">
          <div class="label">Balance</div>
          <div class="value">${escapeHtml(formatCurrency(snapshot.sale.balance_ghs))}</div>
        </div>
        <div class="metric">
          <div class="label">Payment method</div>
          <div class="value" style="font-size:15px;">${escapeHtml(paymentMethodLabel(snapshot.sale.payment_method))}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Product / Service</th>
            <th style="text-align:center;">Qty</th>
            <th style="text-align:right;">Unit price</th>
            <th style="text-align:right;">Line total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      ${snapshot.sale.notes ? `<div class="panel" style="margin-top:24px;"><h3>Notes</h3><div class="line">${escapeHtml(snapshot.sale.notes)}</div></div>` : ''}

      <div class="footer">
        <div>SikaFlow business document</div>
        <div>${escapeHtml(title)} ${escapeHtml(document.document_number)}</div>
      </div>
    </div>
  </body>
</html>`;
}

export function printSaleDocument(document: SaleDocumentRecord) {
  const html = renderSaleDocumentHtml(document);
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=980,height=900');
  if (!popup) return false;

  popup.document.open();
  popup.document.write(html);
  popup.document.close();

  popup.onload = () => {
    popup.focus();
    popup.print();
  };

  return true;
}

export function downloadSaleDocument(document: SaleDocumentRecord) {
  const html = renderSaleDocumentHtml(document);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = documentCreateLink(url, saleDocumentFileName(document));
  anchor.click();
  URL.revokeObjectURL(url);
}

function documentCreateLink(url: string, filename: string) {
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  return anchor;
}
