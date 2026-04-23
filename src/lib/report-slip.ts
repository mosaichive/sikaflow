import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import sikaflowLogo from '@/assets/sikaflow-logo.png';
import notoSansFontUrl from '@/assets/fonts/NotoSans-VariableFont.ttf';
import { formatCurrency } from '@/lib/constants';

export type ReportRangePreset = 'today' | 'week' | 'month' | 'year' | 'custom';

export type ReportStatementRow = {
  date: string;
  reference: string;
  type: string;
  description: string;
  moneyIn: number;
  moneyOut: number;
  runningBalance: number;
};

export type ReportStatementSummary = {
  totalSales: number;
  totalExpenses: number;
  totalSavings: number;
  totalInvestments: number;
  totalInvestorFunds: number;
  totalRestocks: number;
  netPosition: number;
};

type ReportSourceArgs = {
  sales: any[];
  expenses: any[];
  savings: any[];
  investments: any[];
  fundings: any[];
  restocks: any[];
  from: string;
  to: string;
};

type BaseTransaction = Omit<ReportStatementRow, 'runningBalance'> & { timestamp: number };

const COLORS = {
  ink: [15, 23, 42] as const,
  muted: [100, 116, 139] as const,
  line: [226, 232, 240] as const,
  surface: [248, 250, 252] as const,
  accent: [159, 18, 57] as const,
  success: [5, 150, 105] as const,
  danger: [220, 38, 38] as const,
};

let logoPromise: Promise<HTMLImageElement | null> | null = null;
let fontBinaryPromise: Promise<string> | null = null;

export function getPresetRange(preset: Exclude<ReportRangePreset, 'custom'>) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = new Date(end);

  if (preset === 'today') {
    start = new Date(end);
  } else if (preset === 'week') {
    const day = end.getDay();
    const diff = (day + 6) % 7;
    start = new Date(end);
    start.setDate(end.getDate() - diff);
  } else if (preset === 'month') {
    start = new Date(end.getFullYear(), end.getMonth(), 1);
  } else if (preset === 'year') {
    start = new Date(end.getFullYear(), 0, 1);
  }

  return {
    from: formatDateInput(start),
    to: formatDateInput(now),
  };
}

export function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfDayMs(value: string) {
  return new Date(`${value}T00:00:00`).getTime();
}

function endOfDayMs(value: string) {
  return new Date(`${value}T23:59:59`).getTime();
}

function formatShortDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatGeneratedDate(value = new Date()) {
  return value.toLocaleString('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function transactionRef(prefix: string, value?: string | null, id?: string | null) {
  if (value && String(value).trim()) return String(value);
  return `${prefix}-${String(id ?? '').slice(0, 8).toUpperCase()}`;
}

function asTimestamp(value: string | null | undefined) {
  const next = new Date(value ?? '').getTime();
  return Number.isFinite(next) ? next : 0;
}

function orderedTransactions({
  sales,
  expenses,
  savings,
  investments,
  fundings,
  restocks,
}: Omit<ReportSourceArgs, 'from' | 'to'>) {
  const rows: BaseTransaction[] = [
    ...sales.map((sale) => ({
      date: sale.sale_date,
      timestamp: asTimestamp(sale.sale_date),
      reference: transactionRef('SAL', sale.reference, sale.id),
      type: 'Sale',
      description: [
        sale.customer_name || 'Walk-in',
        sale.payment_status ? `Payment ${String(sale.payment_status).toUpperCase()}` : '',
      ].filter(Boolean).join(' • '),
      moneyIn: Number(sale.total ?? 0),
      moneyOut: 0,
    })),
    ...expenses.map((expense) => ({
      date: expense.expense_date,
      timestamp: asTimestamp(expense.expense_date),
      reference: transactionRef('EXP', expense.reference, expense.id),
      type: 'Expense',
      description: [expense.category, expense.description].filter(Boolean).join(' • ') || 'Expense',
      moneyIn: 0,
      moneyOut: Number(expense.amount ?? 0),
    })),
    ...savings.map((saving) => ({
      date: saving.savings_date,
      timestamp: asTimestamp(saving.savings_date),
      reference: transactionRef('SAV', saving.reference, saving.id),
      type: 'Savings',
      description: [saving.source, saving.note].filter(Boolean).join(' • ') || 'Savings transfer',
      moneyIn: 0,
      moneyOut: Number(saving.amount ?? 0),
    })),
    ...investments.map((investment) => ({
      date: investment.investment_date,
      timestamp: asTimestamp(investment.investment_date),
      reference: transactionRef('INV', investment.reference, investment.id),
      type: 'Investment',
      description: [investment.investment_name, investment.status].filter(Boolean).join(' • ') || 'Investment',
      moneyIn: 0,
      moneyOut: Number(investment.amount ?? 0),
    })),
    ...fundings.map((funding) => ({
      date: funding.date_received,
      timestamp: asTimestamp(funding.date_received),
      reference: transactionRef('FND', funding.reference, funding.id),
      type: 'Investor Funds',
      description: [funding.investor_name, funding.investment_type].filter(Boolean).join(' • ') || 'Investor funding',
      moneyIn: Number(funding.amount ?? 0),
      moneyOut: 0,
    })),
    ...restocks.map((restock) => ({
      date: restock.restock_date,
      timestamp: asTimestamp(restock.restock_date),
      reference: transactionRef('RST', restock.reference, restock.id),
      type: 'Restock',
      description: [restock.product_name, restock.supplier].filter(Boolean).join(' • ') || 'Inventory restock',
      moneyIn: 0,
      moneyOut: Number(restock.total_cost ?? 0),
    })),
  ];

  return rows.sort((left, right) => left.timestamp - right.timestamp || left.reference.localeCompare(right.reference));
}

export function buildReportStatement({
  sales,
  expenses,
  savings,
  investments,
  fundings,
  restocks,
  from,
  to,
}: ReportSourceArgs) {
  const ordered = orderedTransactions({ sales, expenses, savings, investments, fundings, restocks });
  const fromMs = startOfDayMs(from);
  const toMs = endOfDayMs(to);
  const inRange = (value: string | null | undefined) => {
    const timestamp = asTimestamp(value);
    return timestamp >= fromMs && timestamp <= toMs;
  };

  const openingBalance = ordered
    .filter((row) => row.timestamp < fromMs)
    .reduce((sum, row) => sum + row.moneyIn - row.moneyOut, 0);

  let runningBalance = openingBalance;
  const rows = ordered
    .filter((row) => row.timestamp >= fromMs && row.timestamp <= toMs)
    .map((row) => {
      runningBalance += row.moneyIn - row.moneyOut;
      return {
        date: row.date,
        reference: row.reference,
        type: row.type,
        description: row.description,
        moneyIn: row.moneyIn,
        moneyOut: row.moneyOut,
        runningBalance,
      };
    });

  const totalSales = sales.filter((sale) => inRange(sale.sale_date)).reduce((sum, sale) => sum + Number(sale.total ?? 0), 0);
  const totalExpenses = expenses.filter((expense) => inRange(expense.expense_date)).reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
  const totalSavings = savings.filter((saving) => inRange(saving.savings_date)).reduce((sum, saving) => sum + Number(saving.amount ?? 0), 0);
  const totalInvestments = investments.filter((investment) => inRange(investment.investment_date)).reduce((sum, investment) => sum + Number(investment.amount ?? 0), 0);
  const totalInvestorFunds = fundings.filter((funding) => inRange(funding.date_received)).reduce((sum, funding) => sum + Number(funding.amount ?? 0), 0);
  const totalRestocks = restocks.filter((restock) => inRange(restock.restock_date)).reduce((sum, restock) => sum + Number(restock.total_cost ?? 0), 0);

  const totalMoneyIn = rows.reduce((sum, row) => sum + row.moneyIn, 0);
  const totalMoneyOut = rows.reduce((sum, row) => sum + row.moneyOut, 0);
  const closingBalance = openingBalance + totalMoneyIn - totalMoneyOut;

  return {
    rows,
    openingBalance,
    closingBalance,
    totalMoneyIn,
    totalMoneyOut,
    summary: {
      totalSales,
      totalExpenses,
      totalSavings,
      totalInvestments,
      totalInvestorFunds,
      totalRestocks,
      netPosition: totalSales + totalInvestorFunds - totalExpenses - totalSavings - totalInvestments - totalRestocks,
    } satisfies ReportStatementSummary,
  };
}

export function statementFilename(from: string, to: string) {
  return `report-slip-${from}-to-${to}.pdf`;
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

async function getLogoImage() {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = sikaflowLogo;
    });
  }
  return logoPromise;
}

function drawHeader(
  doc: jsPDF,
  {
    pageWidth,
    businessName,
    dateFrom,
    dateTo,
    logo,
  }: {
    pageWidth: number;
    businessName: string;
    dateFrom: string;
    dateTo: string;
    logo: HTMLImageElement | null;
  },
) {
  doc.setFillColor(...COLORS.surface);
  doc.rect(0, 0, pageWidth, 60, 'F');
  doc.setDrawColor(...COLORS.line);
  doc.line(0, 60, pageWidth, 60);

  if (logo) {
    doc.addImage(logo, 'PNG', 40, 15, 28, 28);
  }

  const brandX = logo ? 78 : 40;
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.ink);
  doc.text('SikaFlow', brandX, 28);

  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text('Financial Statement', brandX, 42);

  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.ink);
  doc.text(businessName, pageWidth - 40, 25, { align: 'right' });

  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text(`${formatShortDate(dateFrom)} - ${formatShortDate(dateTo)}`, pageWidth - 40, 40, { align: 'right' });
}

function drawValueCard(
  doc: jsPDF,
  {
    x,
    y,
    width,
    label,
    value,
    tone,
  }: {
    x: number;
    y: number;
    width: number;
    label: string;
    value: string;
    tone?: readonly [number, number, number];
  },
) {
  doc.setDrawColor(...COLORS.line);
  doc.roundedRect(x, y, width, 56, 10, 10);
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text(label, x + 12, y + 18);
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...(tone ?? COLORS.ink));
  doc.text(value, x + 12, y + 39);
}

function drawFooter(doc: jsPDF, pageNumber: number, totalPages: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...COLORS.line);
  doc.line(40, pageHeight - 34, pageWidth - 40, pageHeight - 34);
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text('Generated by SikaFlow', 40, pageHeight - 18);
  doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - 40, pageHeight - 18, { align: 'right' });
}

export async function downloadReportSlipPdf({
  businessName,
  generatedFor,
  dateFrom,
  dateTo,
  rows,
  openingBalance,
  closingBalance,
  totalMoneyIn,
  totalMoneyOut,
  summary,
}: {
  businessName: string;
  generatedFor: string;
  dateFrom: string;
  dateTo: string;
  rows: ReportStatementRow[];
  openingBalance: number;
  closingBalance: number;
  totalMoneyIn: number;
  totalMoneyOut: number;
  summary: ReportStatementSummary;
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });
  await ensurePdfFont(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const generatedAt = new Date();
  const logo = await getLogoImage();

  drawHeader(doc, { pageWidth, businessName, dateFrom, dateTo, logo });

  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...COLORS.ink);
  doc.text('Financial Statement', 40, 94);

  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.muted);
  doc.text(`Business / User: ${businessName} • ${generatedFor}`, 40, 114);
  doc.text(`Statement range: ${formatShortDate(dateFrom)} to ${formatShortDate(dateTo)}`, 40, 129);
  doc.text(`Generated: ${formatGeneratedDate(generatedAt)}`, 40, 144);

  const detailBoxX = pageWidth - 220;
  doc.setDrawColor(...COLORS.line);
  doc.roundedRect(detailBoxX, 84, 180, 70, 12, 12);
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.ink);
  doc.text('Statement Details', detailBoxX + 12, 102);
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.muted);
  doc.text('Money In', detailBoxX + 12, 122);
  doc.text(formatCurrency(totalMoneyIn), detailBoxX + 168, 122, { align: 'right' });
  doc.text('Money Out', detailBoxX + 12, 136);
  doc.text(formatCurrency(totalMoneyOut), detailBoxX + 168, 136, { align: 'right' });
  doc.text('Closing Balance', detailBoxX + 12, 150);
  doc.text(formatCurrency(closingBalance), detailBoxX + 168, 150, { align: 'right' });

  const metricGap = 10;
  const metricWidth = (pageWidth - 80 - metricGap * 3) / 4;
  const metricsTop = 176;

  drawValueCard(doc, {
    x: 40,
    y: metricsTop,
    width: metricWidth,
    label: 'Opening Balance',
    value: formatCurrency(openingBalance),
  });
  drawValueCard(doc, {
    x: 40 + (metricWidth + metricGap),
    y: metricsTop,
    width: metricWidth,
    label: 'Total Money In',
    value: formatCurrency(totalMoneyIn),
    tone: COLORS.success,
  });
  drawValueCard(doc, {
    x: 40 + (metricWidth + metricGap) * 2,
    y: metricsTop,
    width: metricWidth,
    label: 'Total Money Out',
    value: formatCurrency(totalMoneyOut),
    tone: COLORS.danger,
  });
  drawValueCard(doc, {
    x: 40 + (metricWidth + metricGap) * 3,
    y: metricsTop,
    width: metricWidth,
    label: 'Closing Balance',
    value: formatCurrency(closingBalance),
  });

  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.ink);
  doc.text('Transaction Statement', 40, 260);

  autoTable(doc, {
    startY: 272,
    margin: { top: 72, right: 40, bottom: 56, left: 40 },
    head: [['Date', 'Reference ID', 'Transaction Type', 'Description', 'Money In', 'Money Out', 'Balance']],
    body: rows.map((row) => [
      new Date(row.date).toLocaleDateString('en-GH'),
      row.reference,
      row.type,
      row.description,
      row.moneyIn > 0 ? formatCurrency(row.moneyIn) : '—',
      row.moneyOut > 0 ? formatCurrency(row.moneyOut) : '—',
      formatCurrency(row.runningBalance),
    ]),
    styles: {
      font: 'NotoSans',
      fontSize: 8.5,
      cellPadding: { top: 6, right: 5, bottom: 6, left: 5 },
      textColor: COLORS.ink,
      lineColor: COLORS.line,
      lineWidth: 0.3,
      overflow: 'linebreak',
      valign: 'top',
    },
    headStyles: {
      fillColor: COLORS.ink,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      lineColor: COLORS.ink,
    },
    alternateRowStyles: {
      fillColor: [250, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 58 },
      1: { cellWidth: 82 },
      2: { cellWidth: 76 },
      3: { cellWidth: 140 },
      4: { cellWidth: 55, halign: 'right' },
      5: { cellWidth: 55, halign: 'right' },
      6: { cellWidth: 59, halign: 'right' },
    },
    didParseCell: (hookData) => {
      if (hookData.section !== 'body') return;
      const sourceRow = rows[hookData.row.index];
      if (!sourceRow) return;
      if (hookData.column.index === 4 && sourceRow.moneyIn > 0) {
        hookData.cell.styles.textColor = COLORS.success;
      }
      if (hookData.column.index === 5 && sourceRow.moneyOut > 0) {
        hookData.cell.styles.textColor = COLORS.danger;
      }
      if (hookData.column.index === 6) {
        hookData.cell.styles.fontStyle = 'bold';
      }
    },
  });

  let summaryStartY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 300) + 26;
  if (summaryStartY + 160 > pageHeight - 56) {
    doc.addPage();
    summaryStartY = 92;
  }

  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.ink);
  doc.text('Statement Summary', 40, summaryStartY);

  autoTable(doc, {
    startY: summaryStartY + 10,
    margin: { left: 40, right: 40 },
    theme: 'grid',
    body: [
      ['Total Sales', formatCurrency(summary.totalSales), 'Total Expenses', formatCurrency(summary.totalExpenses)],
      ['Total Savings', formatCurrency(summary.totalSavings), 'Total Investments', formatCurrency(summary.totalInvestments)],
      ['Total Investor Funds', formatCurrency(summary.totalInvestorFunds), 'Net Position', formatCurrency(summary.netPosition)],
    ],
    styles: {
      font: 'NotoSans',
      fontSize: 9,
      cellPadding: { top: 6, right: 6, bottom: 6, left: 6 },
      lineColor: COLORS.line,
      lineWidth: 0.3,
      textColor: COLORS.ink,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 120 },
      1: { halign: 'right', cellWidth: 110 },
      2: { fontStyle: 'bold', cellWidth: 120 },
      3: { halign: 'right', cellWidth: 125 },
    },
  });

  const noteY = (((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? summaryStartY + 60) + 16);
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.muted);
  doc.text(
    `Net position reflects total sales and investor funds against expenses, savings, investments, and ${formatCurrency(summary.totalRestocks)} in restock spending.`,
    40,
    noteY,
    { maxWidth: pageWidth - 80 },
  );

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawHeader(doc, { pageWidth, businessName, dateFrom, dateTo, logo });
    drawFooter(doc, page, totalPages);
  }

  doc.save(statementFilename(dateFrom, dateTo));
}
