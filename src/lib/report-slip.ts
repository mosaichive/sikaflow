import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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

function transactionRef(prefix: string, value?: string | null, id?: string | null) {
  if (value && String(value).trim()) return String(value);
  return `${prefix}-${String(id ?? '').slice(0, 8).toUpperCase()}`;
}

function asTimestamp(value: string | null | undefined) {
  const next = new Date(value ?? '').getTime();
  return Number.isFinite(next) ? next : 0;
}

function orderedTransactions({ sales, expenses, savings, investments, fundings, restocks }: Omit<ReportSourceArgs, 'from' | 'to'>) {
  const rows: BaseTransaction[] = [
    ...sales.map((sale) => ({
      date: sale.sale_date,
      timestamp: asTimestamp(sale.sale_date),
      reference: transactionRef('SAL', sale.reference, sale.id),
      type: 'Sale',
      description: `${sale.customer_name || 'Walk-in'}${sale.payment_status ? ` • ${String(sale.payment_status).toUpperCase()}` : ''}`,
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
      reference: transactionRef('SVG', saving.reference, saving.id),
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

export function buildReportStatement({ sales, expenses, savings, investments, fundings, restocks, from, to }: ReportSourceArgs) {
  const ordered = orderedTransactions({ sales, expenses, savings, investments, fundings, restocks });
  const fromMs = startOfDayMs(from);
  const toMs = endOfDayMs(to);

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

  const totalMoneyIn = rows.reduce((sum, row) => sum + row.moneyIn, 0);
  const totalMoneyOut = rows.reduce((sum, row) => sum + row.moneyOut, 0);
  const closingBalance = openingBalance + totalMoneyIn - totalMoneyOut;

  return {
    rows,
    openingBalance,
    closingBalance,
    totalMoneyIn,
    totalMoneyOut,
  };
}

export function statementFilename(from: string, to: string) {
  return `report-slip-${from}-to-${to}.pdf`;
}

export function downloadReportSlipPdf({
  businessName,
  dateFrom,
  dateTo,
  rows,
  openingBalance,
  closingBalance,
  totalMoneyIn,
  totalMoneyOut,
}: {
  businessName: string;
  dateFrom: string;
  dateTo: string;
  rows: ReportStatementRow[];
  openingBalance: number;
  closingBalance: number;
  totalMoneyIn: number;
  totalMoneyOut: number;
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, pageWidth, 122, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(159, 18, 57);
  doc.setFontSize(10);
  doc.text('REPORT SLIP', 40, 34);

  doc.setTextColor(17, 24, 39);
  doc.setFontSize(22);
  doc.text(businessName, 40, 58);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(75, 85, 99);
  doc.text(`Financial statement • ${dateFrom} to ${dateTo}`, 40, 78);
  doc.text(`Generated ${new Date().toLocaleString('en-GH')}`, 40, 95);

  const metricsTop = 150;
  const metricWidth = (pageWidth - 110) / 4;
  const metrics = [
    ['Opening Balance', formatCurrency(openingBalance)],
    ['Money In', formatCurrency(totalMoneyIn)],
    ['Money Out', formatCurrency(totalMoneyOut)],
    ['Closing Balance', formatCurrency(closingBalance)],
  ];

  metrics.forEach(([label, value], index) => {
    const x = 40 + index * (metricWidth + 10);
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(x, metricsTop, metricWidth, 56, 10, 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(label, x + 12, metricsTop + 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(17, 24, 39);
    doc.text(value, x + 12, metricsTop + 40);
  });

  autoTable(doc, {
    startY: metricsTop + 76,
    head: [['Date', 'Reference', 'Type', 'Description', 'Money In', 'Money Out', 'Balance']],
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
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 5,
      textColor: [17, 24, 39],
      lineColor: [229, 231, 235],
      lineWidth: 0.4,
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [75, 85, 99],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: 76 },
      2: { cellWidth: 62 },
      3: { cellWidth: 145 },
      4: { halign: 'right', cellWidth: 60 },
      5: { halign: 'right', cellWidth: 60 },
      6: { halign: 'right', cellWidth: 60 },
    },
    margin: { left: 40, right: 40 },
    theme: 'grid',
    didDrawPage: ({ pageNumber }) => {
      doc.setFontSize(9);
      doc.setTextColor(107, 114, 128);
      doc.text(`Page ${pageNumber}`, pageWidth - 70, doc.internal.pageSize.getHeight() - 18);
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? metricsTop + 120;
  doc.setDrawColor(229, 231, 235);
  doc.line(40, finalY + 18, pageWidth - 40, finalY + 18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text(`Summary: In ${formatCurrency(totalMoneyIn)} • Out ${formatCurrency(totalMoneyOut)} • Closing ${formatCurrency(closingBalance)}`, 40, finalY + 38);

  doc.save(statementFilename(dateFrom, dateTo));
}
