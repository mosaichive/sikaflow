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
    logo_url?: string | null;
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
  logo_light_url?: string | null;
  logo_dark_url?: string | null;
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
      logo_url: business?.logo_light_url ?? business?.logo_dark_url ?? null,
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
      logo_url: snapshot.business?.logo_url ?? null,
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

function documentAmountSummary(document: SaleDocumentRecord) {
  const subtotal = formatCurrency(document.amount_ghs);
  const amountPaid = formatCurrency(document.amount_paid_ghs);
  const balance = formatCurrency(document.balance_ghs);

  if (document.kind === 'receipt') {
    return {
      subtotal,
      emphasisLabel: 'Amount Paid',
      emphasisValue: amountPaid,
      secondaryLabel: 'Payment Status',
      secondaryValue: salePaymentLabel(document.payment_status),
    };
  }

  return {
    subtotal,
    emphasisLabel: document.payment_status === 'paid' ? 'Amount Paid' : 'Balance Due',
    emphasisValue: document.payment_status === 'paid' ? amountPaid : balance,
    secondaryLabel: 'Amount Paid',
    secondaryValue: amountPaid,
  };
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
  const amountSummary = documentAmountSummary(document);
  const descriptionRows = snapshot.items.map((item) => `
    <tr>
      <td style="padding:18px 18px 16px;border-bottom:1px solid #dbe1ea;vertical-align:top;">
        <div style="font-size:16px;font-weight:700;color:#0f172a;line-height:1.35;">${escapeHtml(item.product_name)}</div>
        <div style="margin-top:6px;font-size:13px;color:#64748b;line-height:1.5;">
          Qty ${item.quantity} × ${escapeHtml(formatCurrency(item.unit_price))}
          ${[item.sku, item.size, item.color].filter(Boolean).length ? `<br />${[item.sku, item.size, item.color].filter(Boolean).map((part) => escapeHtml(String(part))).join(' • ')}` : ''}
        </div>
      </td>
      <td style="padding:18px 18px 16px;border-bottom:1px solid #dbe1ea;vertical-align:top;text-align:right;font-size:16px;font-weight:700;color:#0f172a;white-space:nowrap;">${escapeHtml(formatCurrency(item.line_total))}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)} ${escapeHtml(document.document_number)}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Inter, Arial, sans-serif; margin: 0; padding: 32px; color: #0f172a; background: #f8fafc; }
      .sheet { max-width: 760px; margin: 0 auto; background: #ffffff; border: 1px solid #dbe1ea; border-radius: 18px; overflow: hidden; }
      .inner { padding: 34px 42px 30px; }
      .heading { display:flex; justify-content:space-between; gap:24px; align-items:flex-start; }
      .brand { display:flex; gap:18px; align-items:flex-start; }
      .logo-box { width: 86px; height: 86px; border: 1px solid #dbe1ea; border-radius: 10px; overflow:hidden; display:flex; align-items:center; justify-content:center; background:#fff; }
      .logo-box img { width: 100%; height: 100%; object-fit: contain; }
      .logo-placeholder { font-size: 12px; color: #94a3b8; text-align:center; padding: 10px; line-height: 1.35; }
      .brand-name { font-size: 18px; font-weight: 800; line-height: 1.35; margin: 0; }
      .brand-lines { margin-top: 12px; font-size: 15px; line-height: 1.5; color:#111827; }
      .doc-title { font-size: 34px; line-height: 1.05; font-weight: 900; margin: 2px 0 10px; letter-spacing: 0.01em; text-transform: uppercase; }
      .doc-number { font-size: 14px; color:#475569; word-break: break-all; }
      .to-block { margin-top: 28px; }
      .label { font-size: 15px; color:#64748b; margin-bottom: 6px; }
      .to-lines { font-size: 15px; line-height: 1.45; font-weight: 700; color:#111827; }
      .rule { border-top: 2px solid #111827; margin: 26px 0 0; }
      .meta-row { display:grid; grid-template-columns: 1fr auto; gap: 28px; padding: 18px 0 16px; align-items:start; }
      .meta-title { font-size: 14px; color:#64748b; margin-bottom: 6px; }
      .meta-value { font-size: 16px; font-weight: 700; color:#0f172a; }
      table { width: 100%; border-collapse: collapse; margin-top: 0; }
      thead th { background:#cbd5e1; color:#ffffff; font-size: 13px; font-weight: 700; letter-spacing: 0.02em; padding: 16px 18px; text-align:left; }
      thead th:last-child { text-align:right; }
      .totals { padding: 18px 0 0; }
      .summary-line { display:flex; justify-content:space-between; gap:16px; padding: 14px 0; border-top: 1px solid #111827; font-size: 15px; }
      .summary-line strong { font-size: 15px; }
      .summary-line.emphasis { border-top: 0; padding-top: 18px; font-size: 18px; font-weight: 800; }
      .summary-line.emphasis strong { font-size: 18px; }
      .summary-line.secondary { color:#475569; border-top: 0; padding-top: 6px; }
      .notes { margin-top: 20px; border-top: 1px solid #dbe1ea; padding-top: 16px; }
      .notes-text { font-size: 14px; color:#334155; line-height: 1.7; }
      .footer { display:flex; justify-content:space-between; gap:16px; padding-top: 18px; margin-top: 22px; border-top: 1px solid #dbe1ea; color:#64748b; font-size: 12px; }
      @media print {
        body { padding: 0; background:#fff; }
        .sheet { max-width: none; border-radius: 0; border: 0; }
      }
      @media (max-width: 760px) {
        body { padding: 16px; }
        .inner { padding: 24px 20px; }
        .heading, .brand, .footer { flex-direction: column; }
        .meta-row { grid-template-columns: 1fr; }
        .doc-title { font-size: 28px; }
        .logo-box { width: 74px; height: 74px; }
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="inner">
        <div class="heading">
          <div class="brand">
            <div class="logo-box">
              ${snapshot.business.logo_url ? `<img src="${escapeHtml(snapshot.business.logo_url)}" alt="${escapeHtml(snapshot.business.name)} logo" />` : `<div class="logo-placeholder">Add logo in profile</div>`}
            </div>
            <div>
              <p class="brand-name">${escapeHtml(snapshot.business.name)}</p>
              <div class="brand-lines">
                ${snapshot.business.location ? `${escapeHtml(snapshot.business.location)}<br />` : ''}
                ${snapshot.business.phone ? `${escapeHtml(snapshot.business.phone)}<br />` : ''}
                ${snapshot.business.email ? `${escapeHtml(snapshot.business.email)}` : ''}
              </div>
            </div>
          </div>
          <div>
            <div class="doc-title">${escapeHtml(title)}</div>
            <div class="doc-number">${escapeHtml(document.document_number)}</div>
          </div>
        </div>

        <div class="to-block">
          <div class="label">To:</div>
          <div class="to-lines">
            ${escapeHtml(snapshot.customer.name)}<br />
            ${snapshot.customer.phone ? `${escapeHtml(snapshot.customer.phone)}<br />` : ''}
            ${snapshot.seller.name ? `Served by ${escapeHtml(snapshot.seller.name)}` : ''}
          </div>
        </div>

        <div class="rule"></div>

        <div class="meta-row">
          <div>
            <div class="meta-title">Payment Method</div>
            <div class="meta-value">${escapeHtml(paymentMethodLabel(snapshot.sale.payment_method))}</div>
          </div>
          <div style="text-align:right;">
            <div class="meta-title">Date • Time</div>
            <div class="meta-value">${escapeHtml(issuedAt)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>${descriptionRows}</tbody>
        </table>

        <div class="totals">
          <div class="summary-line">
            <span>Subtotal</span>
            <strong>${escapeHtml(amountSummary.subtotal)}</strong>
          </div>
          ${document.kind === 'invoice' ? `
            <div class="summary-line secondary">
              <span>${escapeHtml(amountSummary.secondaryLabel)}</span>
              <strong>${escapeHtml(amountSummary.secondaryValue)}</strong>
            </div>
          ` : ''}
          <div class="summary-line emphasis">
            <span>${escapeHtml(amountSummary.emphasisLabel)}</span>
            <strong>${escapeHtml(amountSummary.emphasisValue)}</strong>
          </div>
        </div>

        ${snapshot.sale.notes ? `<div class="notes"><div class="label">Notes</div><div class="notes-text">${escapeHtml(snapshot.sale.notes)}</div></div>` : ''}

        <div class="footer">
          <div>${escapeHtml(title)} ${escapeHtml(document.document_number)}</div>
          <div>Sale date: ${escapeHtml(saleDate)}</div>
        </div>
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
