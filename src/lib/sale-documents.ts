import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import notoSansFontUrl from '@/assets/fonts/NotoSans-VariableFont.ttf';
import sikaflowLogo from '@/assets/sikaflow-logo.png';
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
    subtotal_ghs: number;
    discount_ghs: number;
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
  subtotal?: number | string | null;
  discount?: number | string | null;
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

type DocumentSummaryRow = {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: string;
};

const PDF_COLORS = {
  ink: [15, 23, 42] as const,
  muted: [100, 116, 139] as const,
  line: [226, 232, 240] as const,
  surface: [245, 247, 250] as const,
  accent: [31, 41, 55] as const,
};

let fontBinaryPromise: Promise<string> | null = null;
let fallbackLogoPromise: Promise<string | null> | null = null;
const imageCache = new Map<string, Promise<string | null>>();

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

function documentDate(value: string, options?: Intl.DateTimeFormatOptions) {
  return new Date(value).toLocaleString('en-GH', options ?? {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function paymentTone(status: SalePaymentStatus) {
  if (status === 'paid') return '#0f766e';
  if (status === 'partial') return '#b45309';
  return '#b91c1c';
}

function imageFormatFromDataUrl(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  const match = /^data:image\/([a-zA-Z0-9+.-]+);base64,/.exec(dataUrl);
  const mime = match?.[1]?.toLowerCase() ?? 'png';
  if (mime.includes('png')) return 'PNG';
  if (mime.includes('webp')) return 'WEBP';
  return 'JPEG';
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read file data.'));
    reader.readAsDataURL(blob);
  });
}

async function getPdfFontBinary() {
  if (!fontBinaryPromise) {
    fontBinaryPromise = fetch(notoSansFontUrl)
      .then((response) => response.arrayBuffer())
      .then((buffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let index = 0; index < bytes.length; index += 1) {
          binary += String.fromCharCode(bytes[index]);
        }
        return binary;
      });
  }
  return fontBinaryPromise;
}

async function ensurePdfFont(doc: jsPDF) {
  const fontBinary = await getPdfFontBinary();
  doc.addFileToVFS('NotoSans.ttf', fontBinary);
  doc.addFont('NotoSans.ttf', 'NotoSans', 'normal');
  doc.addFont('NotoSans.ttf', 'NotoSans', 'bold');
  doc.setFont('NotoSans', 'normal');
}

async function fetchImageDataUrl(url: string) {
  if (!imageCache.has(url)) {
    imageCache.set(
      url,
      fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error('Image fetch failed');
          return response.blob();
        })
        .then(blobToDataUrl)
        .catch(() => null),
    );
  }

  return imageCache.get(url)!;
}

async function getFallbackLogoDataUrl() {
  if (!fallbackLogoPromise) {
    fallbackLogoPromise = fetchImageDataUrl(sikaflowLogo);
  }
  return fallbackLogoPromise;
}

async function resolveLogoDataUrl(document: SaleDocumentRecord) {
  if (document.snapshot.business.logo_url) {
    const customLogo = await fetchImageDataUrl(document.snapshot.business.logo_url);
    if (customLogo) return customLogo;
  }
  return getFallbackLogoDataUrl();
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
      subtotal_ghs: numberValue(sale.subtotal),
      discount_ghs: numberValue(sale.discount),
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

function inferredSubtotal(snapshot: Partial<SaleDocumentSnapshot['sale']>) {
  const explicitSubtotal = numberValue(snapshot.subtotal_ghs);
  const discount = numberValue(snapshot.discount_ghs);
  const total = numberValue(snapshot.amount_ghs);
  return explicitSubtotal > 0 ? explicitSubtotal : total + discount;
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
      subtotal_ghs: inferredSubtotal(snapshot.sale ?? {}),
      discount_ghs: numberValue(snapshot.sale?.discount_ghs),
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

function documentMetrics(document: SaleDocumentRecord) {
  const subtotal = inferredSubtotal(document.snapshot.sale);
  const discount = numberValue(document.snapshot.sale.discount_ghs);
  const total = numberValue(document.snapshot.sale.amount_ghs);
  const amountPaid = numberValue(document.snapshot.sale.amount_paid_ghs);
  const balance = numberValue(document.snapshot.sale.balance_ghs);
  return { subtotal, discount, total, amountPaid, balance };
}

function documentSummaryRows(document: SaleDocumentRecord) {
  const { subtotal, discount, total, amountPaid, balance } = documentMetrics(document);
  const rows: DocumentSummaryRow[] = [
    { label: 'Subtotal', value: formatCurrency(subtotal) },
    ...(discount > 0 ? [{ label: 'Discount', value: `- ${formatCurrency(discount)}` }] : []),
    { label: 'Total', value: formatCurrency(total), emphasis: true },
  ];

  if (document.kind === 'invoice') {
    rows.push(
      { label: 'Amount Paid', value: formatCurrency(amountPaid) },
      { label: 'Balance Due', value: formatCurrency(balance), tone: balance > 0 ? paymentTone(document.payment_status) : '#0f172a' },
    );
  } else {
    rows.push({ label: 'Amount Paid', value: formatCurrency(amountPaid), tone: paymentTone('paid') });
  }

  return rows;
}

function paymentMethodLabel(value?: string | null) {
  if (!value) return 'Not specified';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function lineItemDetails(item: SaleDocumentItem) {
  return [item.sku, item.size, item.color].filter(Boolean).join(' • ');
}

export function saleDocumentFileName(document: SaleDocumentRecord) {
  return `${document.document_number.toLowerCase()}-${document.customer_name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'customer'}.pdf`;
}

export function renderSaleDocumentHtml(document: SaleDocumentRecord) {
  const { snapshot } = document;
  const title = saleDocumentLabel(document.kind).toUpperCase();
  const saleDate = documentDate(snapshot.sale.sale_date, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const issuedAt = documentDate(document.issued_at, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const summaryRows = documentSummaryRows(document)
    .map((row) => `
      <div class="summary-row ${row.emphasis ? 'emphasis' : ''}">
        <span>${escapeHtml(row.label)}</span>
        <strong${row.tone ? ` style="color:${row.tone};"` : ''}>${escapeHtml(row.value)}</strong>
      </div>
    `)
    .join('');
  const itemRows = snapshot.items
    .map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>
          <div class="item-title">${escapeHtml(item.product_name)}</div>
          ${lineItemDetails(item) ? `<div class="item-sub">${escapeHtml(lineItemDetails(item))}</div>` : ''}
        </td>
        <td class="align-right">${escapeHtml(formatCurrency(item.unit_price))}</td>
        <td class="align-center">${escapeHtml(String(item.quantity))}</td>
        <td class="align-right">${escapeHtml(formatCurrency(item.line_total))}</td>
      </tr>
    `)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)} ${escapeHtml(document.document_number)}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 24px;
        background: #eef2f7;
        font-family: Inter, Arial, sans-serif;
        color: #0f172a;
      }
      .sheet {
        max-width: 880px;
        margin: 0 auto;
        background: #ffffff;
        border: 1px solid #dbe1ea;
        box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
      }
      .header {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
        min-height: 148px;
      }
      .brand-panel {
        background: #f6f8fb;
        padding: 28px 34px;
        display: flex;
        gap: 18px;
        align-items: flex-start;
      }
      .logo-box {
        width: 84px;
        height: 84px;
        border: 1px solid #dbe1ea;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .logo-box img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .logo-placeholder {
        padding: 8px;
        text-align: center;
        font-size: 11px;
        line-height: 1.3;
        color: #94a3b8;
      }
      .brand-name {
        margin: 0;
        font-size: 22px;
        font-weight: 800;
        line-height: 1.1;
      }
      .brand-tag {
        margin-top: 6px;
        font-size: 12px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #64748b;
      }
      .business-lines {
        margin-top: 16px;
        color: #475569;
        font-size: 13px;
        line-height: 1.65;
      }
      .title-panel {
        background: #2b3038;
        color: #ffffff;
        padding: 28px 34px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .title {
        margin: 0;
        font-size: 44px;
        font-weight: 800;
        letter-spacing: 0.03em;
      }
      .title-meta {
        font-size: 13px;
        line-height: 1.7;
        color: rgba(255, 255, 255, 0.82);
      }
      .content {
        padding: 30px 34px 0;
      }
      .details-grid {
        display: grid;
        grid-template-columns: 1.1fr 0.9fr;
        gap: 28px;
      }
      .section-label {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #64748b;
        margin-bottom: 12px;
      }
      .bill-lines {
        font-size: 15px;
        line-height: 1.6;
      }
      .bill-lines strong {
        display: block;
        font-size: 18px;
        line-height: 1.35;
      }
      .meta-list {
        display: grid;
        gap: 10px;
      }
      .meta-row {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        font-size: 14px;
      }
      .meta-row span:first-child {
        color: #64748b;
      }
      .meta-row span:last-child {
        font-weight: 700;
        text-align: right;
      }
      .items {
        width: 100%;
        border-collapse: collapse;
        margin-top: 28px;
      }
      .items thead th {
        background: #2b3038;
        color: #ffffff;
        padding: 14px 12px;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        text-align: left;
      }
      .items tbody td {
        border-bottom: 1px solid #e5e7eb;
        padding: 14px 12px;
        vertical-align: top;
        font-size: 14px;
      }
      .items tbody tr:last-child td {
        border-bottom: 0;
      }
      .align-right {
        text-align: right;
        white-space: nowrap;
      }
      .align-center {
        text-align: center;
      }
      .item-title {
        font-weight: 700;
        color: #0f172a;
      }
      .item-sub {
        margin-top: 4px;
        color: #64748b;
        font-size: 12px;
      }
      .lower {
        display: grid;
        grid-template-columns: 1.05fr 0.95fr;
        gap: 26px;
        margin-top: 28px;
        padding-bottom: 28px;
      }
      .box {
        border-top: 2px solid #dbe1ea;
        padding-top: 16px;
      }
      .payment-lines,
      .notes-lines {
        color: #475569;
        font-size: 14px;
        line-height: 1.7;
      }
      .payment-lines strong {
        display: block;
        color: #0f172a;
        font-size: 18px;
        margin-bottom: 8px;
      }
      .summary {
        border: 1px solid #dbe1ea;
      }
      .summary-row {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 13px 16px;
        border-bottom: 1px solid #e5e7eb;
        font-size: 14px;
      }
      .summary-row:last-child {
        border-bottom: 0;
      }
      .summary-row strong {
        white-space: nowrap;
        text-align: right;
      }
      .summary-row.emphasis {
        background: #f8fafc;
        font-size: 16px;
      }
      .summary-row.emphasis strong {
        font-size: 18px;
      }
      .footer {
        background: #2b3038;
        color: rgba(255, 255, 255, 0.88);
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
        padding: 18px 34px;
        font-size: 12px;
      }
      .footer-block {
        line-height: 1.65;
      }
      @page {
        margin: 0;
      }
      @media print {
        body {
          padding: 0;
          background: #ffffff;
        }
        .sheet {
          max-width: none;
          border: 0;
          box-shadow: none;
        }
      }
      @media (max-width: 860px) {
        body { padding: 12px; }
        .header,
        .details-grid,
        .lower,
        .footer {
          grid-template-columns: 1fr;
        }
        .brand-panel,
        .title-panel,
        .content,
        .footer {
          padding-left: 20px;
          padding-right: 20px;
        }
        .title { font-size: 34px; }
        .items thead th:nth-child(3),
        .items tbody td:nth-child(3) {
          display: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="header">
        <div class="brand-panel">
          <div class="logo-box">
            ${
              snapshot.business.logo_url
                ? `<img src="${escapeHtml(snapshot.business.logo_url)}" alt="${escapeHtml(snapshot.business.name)} logo" />`
                : `<img src="${escapeHtml(sikaflowLogo)}" alt="SikaFlow logo" />`
            }
          </div>
          <div>
            <p class="brand-name">${escapeHtml(snapshot.business.name)}</p>
            <div class="brand-tag">SikaFlow Document</div>
            <div class="business-lines">
              ${snapshot.business.location ? `${escapeHtml(snapshot.business.location)}<br />` : ''}
              ${snapshot.business.phone ? `${escapeHtml(snapshot.business.phone)}<br />` : ''}
              ${snapshot.business.email ? `${escapeHtml(snapshot.business.email)}` : ''}
            </div>
          </div>
        </div>
        <div class="title-panel">
          <h1 class="title">${escapeHtml(title)}</h1>
          <div class="title-meta">
            <div>${escapeHtml(document.document_number)}</div>
            <div>Status: ${escapeHtml(salePaymentLabel(document.payment_status))}</div>
          </div>
        </div>
      </div>

      <div class="content">
        <div class="details-grid">
          <div>
            <div class="section-label">Bill To</div>
            <div class="bill-lines">
              <strong>${escapeHtml(snapshot.customer.name)}</strong>
              ${snapshot.customer.phone ? `${escapeHtml(snapshot.customer.phone)}<br />` : ''}
              Served by ${escapeHtml(snapshot.seller.name)}
            </div>
          </div>
          <div>
            <div class="section-label">Document Details</div>
            <div class="meta-list">
              <div class="meta-row"><span>${escapeHtml(document.kind === 'invoice' ? 'Invoice' : 'Receipt')} No.</span><span>${escapeHtml(document.document_number)}</span></div>
              <div class="meta-row"><span>Sale Date</span><span>${escapeHtml(saleDate)}</span></div>
              <div class="meta-row"><span>Issued</span><span>${escapeHtml(issuedAt)}</span></div>
              <div class="meta-row"><span>Payment Method</span><span>${escapeHtml(paymentMethodLabel(snapshot.sale.payment_method))}</span></div>
            </div>
          </div>
        </div>

        <table class="items">
          <thead>
            <tr>
              <th style="width:8%;">St</th>
              <th>Item Description</th>
              <th style="width:16%;">Rate</th>
              <th style="width:10%;">Qty</th>
              <th style="width:18%;text-align:right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <div class="lower">
          <div>
            <div class="box">
              <div class="section-label">Payment Method</div>
              <div class="payment-lines">
                <strong>${escapeHtml(paymentMethodLabel(snapshot.sale.payment_method))}</strong>
                ${snapshot.business.phone ? `Business contact: ${escapeHtml(snapshot.business.phone)}<br />` : ''}
                ${snapshot.business.email ? `Email: ${escapeHtml(snapshot.business.email)}` : ''}
              </div>
            </div>
            <div class="box" style="margin-top:20px;">
              <div class="section-label">Terms &amp; Notes</div>
              <div class="notes-lines">
                ${snapshot.sale.notes ? escapeHtml(snapshot.sale.notes) : 'Thank you for choosing SikaFlow. Please keep this document for your records.'}
              </div>
            </div>
          </div>
          <div class="summary">
            ${summaryRows}
          </div>
        </div>
      </div>

      <div class="footer">
        <div class="footer-block">${escapeHtml(snapshot.business.phone ?? 'Business phone available in profile')}</div>
        <div class="footer-block">${escapeHtml(snapshot.business.email ?? 'Managed with SikaFlow')}</div>
        <div class="footer-block">${escapeHtml(snapshot.business.location ?? 'Ghana')}</div>
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

function drawPdfFooter(doc: jsPDF, pageNumber: number, totalPages: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...PDF_COLORS.line);
  doc.line(40, pageHeight - 28, pageWidth - 40, pageHeight - 28);
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - 40, pageHeight - 12, { align: 'right' });
}

export async function downloadSaleDocument(document: SaleDocumentRecord) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });
  await ensurePdfFont(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 38;
  const contentWidth = pageWidth - marginX * 2;
  const rightPanelWidth = 210;
  const title = saleDocumentLabel(document.kind).toUpperCase();
  const saleDate = documentDate(document.snapshot.sale.sale_date, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const issuedAt = documentDate(document.issued_at, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const summaryRows = documentSummaryRows(document);
  const logoDataUrl = await resolveLogoDataUrl(document);

  doc.setFillColor(...PDF_COLORS.surface);
  doc.rect(marginX, 34, contentWidth - rightPanelWidth, 126, 'F');
  doc.setFillColor(...PDF_COLORS.accent);
  doc.rect(pageWidth - marginX - rightPanelWidth, 34, rightPanelWidth, 126, 'F');
  doc.setDrawColor(...PDF_COLORS.line);
  doc.rect(marginX, 34, contentWidth, 126);

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, imageFormatFromDataUrl(logoDataUrl), marginX + 18, 52, 64, 64);
  } else {
    doc.setDrawColor(...PDF_COLORS.line);
    doc.rect(marginX + 18, 52, 64, 64);
  }

  const brandX = marginX + 96;
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text(document.snapshot.business.name, brandX, 78);
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text('SIKAFLOW DOCUMENT', brandX, 96);

  const businessLines = [
    document.snapshot.business.location,
    document.snapshot.business.phone,
    document.snapshot.business.email,
  ].filter(Boolean) as string[];
  let businessLineY = 118;
  businessLines.forEach((line) => {
    doc.text(line, brandX, businessLineY);
    businessLineY += 14;
  });

  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(255, 255, 255);
  doc.text(title, pageWidth - marginX - 20, 86, { align: 'right' });
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(10);
  doc.text(document.document_number, pageWidth - marginX - 20, 114, { align: 'right' });
  doc.text(`Status: ${salePaymentLabel(document.payment_status)}`, pageWidth - marginX - 20, 132, { align: 'right' });

  let cursorY = 194;
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text('BILL TO', marginX, cursorY);
  doc.text('DOCUMENT DETAILS', pageWidth / 2 + 16, cursorY);

  cursorY += 18;
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text(document.snapshot.customer.name, marginX, cursorY);
  cursorY += 16;
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(11);
  if (document.snapshot.customer.phone) {
    doc.text(document.snapshot.customer.phone, marginX, cursorY);
    cursorY += 14;
  }
  doc.text(`Served by ${document.snapshot.seller.name}`, marginX, cursorY);

  const metaXLabel = pageWidth / 2 + 16;
  const metaXValue = pageWidth - marginX;
  const metaRows = [
    { label: document.kind === 'invoice' ? 'Invoice No.' : 'Receipt No.', value: document.document_number },
    { label: 'Sale Date', value: saleDate },
    { label: 'Issued', value: issuedAt },
    { label: 'Payment Method', value: paymentMethodLabel(document.snapshot.sale.payment_method) },
  ];

  let metaY = 212;
  doc.setFontSize(10);
  metaRows.forEach((row) => {
    doc.setFont('NotoSans', 'normal');
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(row.label, metaXLabel, metaY);
    doc.setFont('NotoSans', 'bold');
    doc.setTextColor(...PDF_COLORS.ink);
    doc.text(row.value, metaXValue, metaY, { align: 'right', maxWidth: 170 });
    metaY += 16;
  });

  const tableStartY = 284;
  autoTable(doc, {
    startY: tableStartY,
    head: [['ST', 'ITEM DESCRIPTION', 'RATE', 'QTY', 'AMOUNT']],
    body: document.snapshot.items.map((item, index) => [
      String(index + 1),
      [item.product_name, lineItemDetails(item)].filter(Boolean).join('\n'),
      formatCurrency(item.unit_price),
      String(item.quantity),
      formatCurrency(item.line_total),
    ]),
    theme: 'grid',
    margin: { left: marginX, right: marginX },
    styles: {
      font: 'NotoSans',
      fontSize: 10,
      cellPadding: { top: 8, right: 10, bottom: 8, left: 10 },
      lineColor: PDF_COLORS.line,
      lineWidth: 0.6,
      textColor: PDF_COLORS.ink,
      valign: 'top',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: PDF_COLORS.accent,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 34, halign: 'center' },
      1: { cellWidth: 240 },
      2: { cellWidth: 88, halign: 'right' },
      3: { cellWidth: 52, halign: 'center' },
      4: { cellWidth: 106, halign: 'right' },
    },
  });

  const tableBottomY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? tableStartY) + 26;
  const paymentBoxY = tableBottomY;
  const paymentBoxWidth = 250;
  const summaryBoxX = pageWidth - marginX - 210;
  const summaryBoxWidth = 210;

  doc.setDrawColor(...PDF_COLORS.line);
  doc.line(marginX, paymentBoxY, marginX + paymentBoxWidth, paymentBoxY);
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text('PAYMENT METHOD', marginX, paymentBoxY + 18);
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text(paymentMethodLabel(document.snapshot.sale.payment_method), marginX, paymentBoxY + 42);
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.muted);
  if (document.snapshot.business.phone) {
    doc.text(`Business contact: ${document.snapshot.business.phone}`, marginX, paymentBoxY + 60);
  }
  if (document.snapshot.business.email) {
    doc.text(`Email: ${document.snapshot.business.email}`, marginX, paymentBoxY + 76);
  }

  const notesY = paymentBoxY + 118;
  doc.setDrawColor(...PDF_COLORS.line);
  doc.line(marginX, notesY, marginX + paymentBoxWidth, notesY);
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text('TERMS & NOTES', marginX, notesY + 18);
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(10);
  const notesText = document.snapshot.sale.notes || 'Thank you for choosing SikaFlow. Please keep this document for your records.';
  const wrappedNotes = doc.splitTextToSize(notesText, paymentBoxWidth);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text(wrappedNotes, marginX, notesY + 38);

  let summaryRowY = paymentBoxY + 16;
  doc.setDrawColor(...PDF_COLORS.line);
  doc.rect(summaryBoxX, paymentBoxY, summaryBoxWidth, summaryRows.length * 28 + 16);
  summaryRows.forEach((row, index) => {
    if (index > 0) {
      doc.line(summaryBoxX, summaryRowY - 10, summaryBoxX + summaryBoxWidth, summaryRowY - 10);
    }
    doc.setFont('NotoSans', row.emphasis ? 'bold' : 'normal');
    doc.setFontSize(row.emphasis ? 11 : 10);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(row.label, summaryBoxX + 12, summaryRowY);
    const tone = row.tone
      ? (() => {
          if (row.tone === '#0f766e') return [15, 118, 110] as const;
          if (row.tone === '#b45309') return [180, 83, 9] as const;
          if (row.tone === '#b91c1c') return [185, 28, 28] as const;
          return PDF_COLORS.ink;
        })()
      : PDF_COLORS.ink;
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(row.emphasis ? 13 : 10);
    doc.setTextColor(...tone);
    doc.text(row.value, summaryBoxX + summaryBoxWidth - 12, summaryRowY, { align: 'right' });
    summaryRowY += 28;
  });

  const footerHeight = 42;
  doc.setFillColor(...PDF_COLORS.accent);
  doc.rect(marginX, pageHeight - 72, contentWidth, footerHeight, 'F');
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(document.snapshot.business.phone || 'Business phone available in profile', marginX + 14, pageHeight - 46);
  doc.text(document.snapshot.business.email || 'Managed with SikaFlow', pageWidth / 2, pageHeight - 46, { align: 'center' });
  doc.text(document.snapshot.business.location || 'Ghana', pageWidth - marginX - 14, pageHeight - 46, { align: 'right' });

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawPdfFooter(doc, page, totalPages);
  }

  doc.save(saleDocumentFileName(document));
}

function documentCreateLink(url: string, filename: string) {
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  return anchor;
}

export function downloadSaleDocumentHtml(document: SaleDocumentRecord) {
  const html = renderSaleDocumentHtml(document);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = documentCreateLink(url, `${saleDocumentFileName(document).replace(/\.pdf$/, '')}.html`);
  anchor.click();
  URL.revokeObjectURL(url);
}
