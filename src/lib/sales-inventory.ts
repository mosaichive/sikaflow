export type PaymentMethod = 'cash' | 'momo' | 'bank_transfer' | 'card';
export type PaymentStatus = 'paid' | 'partial' | 'unpaid' | 'overdue';
export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'ready_for_pickup' | 'delivered' | 'cancelled';

type NumberLike = number | string | null | undefined;

type SaleLike = {
  total?: NumberLike;
  amount_paid?: NumberLike;
  discount?: NumberLike;
  payment_status?: string | null;
  status?: string | null;
  sale_channel?: string | null;
  sale_date?: string | null;
};

type SaleItemLike = {
  sale_id?: string | null;
  quantity?: NumberLike;
  unit_price?: NumberLike;
  cost_price?: NumberLike;
  line_total?: NumberLike;
};

type ProductLike = {
  quantity?: NumberLike;
  cost_price?: NumberLike;
  selling_price?: NumberLike;
  low_stock_threshold?: NumberLike;
  reorder_level?: NumberLike;
  is_archived?: boolean | null;
};

type AmountLike = {
  amount?: NumberLike;
};

export function toNumber(value: NumberLike) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeText(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}

export function isCancelledStatus(value: string | null | undefined) {
  return normalizeText(value) === 'cancelled';
}

export function isDeliveredSale(row: SaleLike) {
  const status = normalizeText(row.status);
  if (!status) return true;
  return status === 'completed' || status === 'delivered';
}

export function getPaidAmount(row: SaleLike) {
  const total = Math.max(0, toNumber(row.total));
  const amountPaid = Math.max(0, toNumber(row.amount_paid));
  const paymentStatus = normalizeText(row.payment_status);

  if (paymentStatus === 'unpaid' || paymentStatus === 'overdue') return 0;
  if (paymentStatus === 'paid') return amountPaid > 0 ? Math.min(amountPaid, total || amountPaid) : total;
  if (paymentStatus === 'partial') return Math.min(amountPaid, total || amountPaid);
  return amountPaid > 0 ? Math.min(amountPaid, total || amountPaid) : 0;
}

export function isRecognizedSale(row: SaleLike) {
  return !isCancelledStatus(row.status) && isDeliveredSale(row) && getPaidAmount(row) > 0;
}

export function calculateSalesIncome(sales: SaleLike[]) {
  return sales.reduce((sum, sale) => sum + (isRecognizedSale(sale) ? getPaidAmount(sale) : 0), 0);
}

export function calculateSalesProfit(sales: SaleLike[], saleItems: SaleItemLike[]) {
  const saleMap = new Map<string, SaleLike>();
  sales.forEach((sale: any) => {
    if (sale?.id) saleMap.set(sale.id, sale);
  });

  return saleItems.reduce((sum, item: any) => {
    const sale = item.sale_id ? saleMap.get(item.sale_id) : undefined;
    if (!sale || !isRecognizedSale(sale)) return sum;
    const quantity = Math.max(0, toNumber(item.quantity));
    const unitPrice = toNumber(item.unit_price);
    const costPrice = toNumber(item.cost_price);
    return sum + (unitPrice - costPrice) * quantity;
  }, 0);
}

export function calculateTotalOtherIncome(rows: AmountLike[]) {
  return rows.reduce((sum, row) => sum + toNumber(row.amount), 0);
}

export function calculateTotalExpenses(rows: AmountLike[]) {
  return rows.reduce((sum, row) => sum + toNumber(row.amount), 0);
}

export function calculateAvailableBusinessMoney({
  sales,
  otherIncome,
  expenses,
  savings,
  investments,
}: {
  sales: SaleLike[];
  otherIncome: AmountLike[];
  expenses: AmountLike[];
  savings: AmountLike[];
  investments: AmountLike[];
}) {
  const salesIncome = calculateSalesIncome(sales);
  const totalOtherIncome = calculateTotalOtherIncome(otherIncome);
  const totalExpenses = calculateTotalExpenses(expenses);
  const totalSavings = calculateTotalExpenses(savings);
  const totalInvestments = calculateTotalExpenses(investments);
  const totalIncome = salesIncome + totalOtherIncome;

  return {
    salesIncome,
    otherIncome: totalOtherIncome,
    totalIncome,
    availableBusinessMoney: totalIncome - totalExpenses - totalSavings - totalInvestments,
  };
}

export function calculateDashboardTotals({
  sales,
  saleItems,
  products,
  otherIncome,
  expenses,
  savings,
  investments,
}: {
  sales: SaleLike[];
  saleItems: SaleItemLike[];
  products: ProductLike[];
  otherIncome: AmountLike[];
  expenses: AmountLike[];
  savings: AmountLike[];
  investments: AmountLike[];
}) {
  const money = calculateAvailableBusinessMoney({ sales, otherIncome, expenses, savings, investments });
  const salesProfit = calculateSalesProfit(sales, saleItems);
  const totalExpenses = calculateTotalExpenses(expenses);
  const stockLeft = products.reduce((sum, product) => sum + Math.max(0, toNumber(product.quantity)), 0);
  const lowStockCount = products.filter((product) => {
    if (product.is_archived) return false;
    const threshold = toNumber(product.low_stock_threshold ?? product.reorder_level ?? 0);
    return Math.max(0, toNumber(product.quantity)) <= threshold;
  }).length;

  return {
    availableBusinessMoney: money.availableBusinessMoney,
    salesIncome: money.salesIncome,
    otherIncome: money.otherIncome,
    totalIncome: money.totalIncome,
    totalProfit: salesProfit + money.otherIncome - totalExpenses,
    salesProfit,
    totalExpenses,
    stockLeft,
    lowStockCount,
  };
}

export function calculateStockValue(products: ProductLike[], mode: 'cost' | 'selling' = 'selling') {
  return products.reduce((sum, product) => {
    const quantity = Math.max(0, toNumber(product.quantity));
    const unitValue = toNumber(mode === 'cost' ? product.cost_price : product.selling_price);
    return sum + quantity * unitValue;
  }, 0);
}

export function getIsoDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

export function sumTodaySales(sales: SaleLike[], date = new Date()) {
  const day = getIsoDate(date);
  return sales.reduce((sum, sale) => {
    if (!sale.sale_date || getIsoDate(sale.sale_date) !== day || !isRecognizedSale(sale)) return sum;
    return sum + getPaidAmount(sale);
  }, 0);
}

export function getCreditStatus(paymentStatus: string | null | undefined, dueDate: string | null | undefined) {
  const normalized = normalizeText(paymentStatus);
  if (normalized === 'paid') return 'Paid';
  if (normalized === 'partial') return 'Partially Paid';
  if (normalized === 'unpaid' || normalized === 'overdue') {
    if (dueDate && new Date(dueDate).getTime() < Date.now()) return 'Overdue';
    return normalized === 'overdue' ? 'Overdue' : 'Unpaid';
  }
  return 'Unpaid';
}
