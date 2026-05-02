export type PaymentMethod = 'cash' | 'momo' | 'bank_transfer' | 'card';
export type PaymentStatus = 'paid' | 'partial' | 'unpaid' | 'overdue';
export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'ready_for_pickup' | 'delivered' | 'cancelled';

type NumberLike = number | string | null | undefined;

type SaleLike = {
  id?: string | null;
  total?: NumberLike;
  amount_paid?: NumberLike;
  discount?: NumberLike;
  payment_status?: string | null;
  status?: string | null;
  stock_status?: string | null;
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

type ExpenseLike = AmountLike & {
  description?: string | null;
  category?: string | null;
};

type RestockLike = {
  id?: string | null;
  total_cost?: NumberLike;
  status?: string | null;
};

export type FinancialSnapshot = {
  openingCashBalance: number;
  paidSalesRevenue: number;
  cogs: number;
  salesGrossProfit: number;
  otherIncome: number;
  investorFunds: number;
  totalIncome: number;
  operatingExpenses: number;
  restockExpenseSpending: number;
  totalSavings: number;
  totalInvestments: number;
  totalMoneyOut: number;
  availableBusinessMoney: number;
  profit: number;
  stockLeft: number;
  stockValueCost: number;
  stockValueSelling: number;
  lowStockCount: number;
  negativeStockCount: number;
  totalRestockSpending: number;
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

export function isNegativeStockSale(row: SaleLike) {
  return normalizeText(row.stock_status) === 'negative_stock_sale' || normalizeText(row.stock_status) === 'backorder_sale';
}

export function calculateSalesIncome(sales: SaleLike[]) {
  return sales.reduce((sum, sale) => sum + (isRecognizedSale(sale) ? getPaidAmount(sale) : 0), 0);
}

export function calculateCOGS(sales: SaleLike[], saleItems: SaleItemLike[]) {
  const saleMap = new Map<string, SaleLike>();
  sales.forEach((sale: any) => {
    if (sale?.id) saleMap.set(sale.id, sale);
  });

  return saleItems.reduce((sum, item: any) => {
    const sale = item.sale_id ? saleMap.get(item.sale_id) : undefined;
    if (!sale || !isRecognizedSale(sale)) return sum;
    const quantity = Math.max(0, toNumber(item.quantity));
    const costPrice = toNumber(item.cost_price);
    return sum + costPrice * quantity;
  }, 0);
}

export function calculateSalesProfit(sales: SaleLike[], saleItems: SaleItemLike[]) {
  return calculateSalesIncome(sales) - calculateCOGS(sales, saleItems);
}

export function calculateTotalOtherIncome(rows: AmountLike[]) {
  return rows.reduce((sum, row) => sum + toNumber(row.amount), 0);
}

export function calculateTotalExpenses(rows: AmountLike[]) {
  return rows.reduce((sum, row) => sum + toNumber(row.amount), 0);
}

export function getRestockExpenseIdFromDescription(description: string | null | undefined) {
  const match = String(description ?? '').match(/\[RESTOCK:([a-f0-9-]+)\]/i);
  return match?.[1] ?? null;
}

export function isRestockExpenseRow(row: ExpenseLike) {
  const description = normalizeText(row.description);
  const category = normalizeText(row.category);
  return !!getRestockExpenseIdFromDescription(row.description) || description.includes('inventory purchase (restock)') || category === 'restock';
}

export function calculateOperatingExpenses(rows: ExpenseLike[]) {
  return rows.reduce((sum, row) => sum + (isRestockExpenseRow(row) ? 0 : toNumber(row.amount)), 0);
}

export function calculateRestockExpenseSpending(rows: RestockLike[]) {
  return rows.reduce((sum, row) => {
    if (isCancelledStatus(row.status)) return sum;
    return sum + toNumber(row.total_cost);
  }, 0);
}

export function calculateStockLeft(products: ProductLike[]) {
  return products.reduce((sum, product) => sum + toNumber(product.quantity), 0);
}

export function calculateLowStockCount(products: ProductLike[]) {
  return products.filter((product) => {
    if (product.is_archived) return false;
    const quantity = toNumber(product.quantity);
    const threshold = toNumber(product.low_stock_threshold ?? product.reorder_level ?? 0);
    return quantity > 0 && quantity <= threshold;
  }).length;
}

export function calculateNegativeStockCount(products: ProductLike[]) {
  return products.filter((product) => !product.is_archived && toNumber(product.quantity) < 0).length;
}

export function calculateRestockSpending(rows: RestockLike[]) {
  return rows.reduce((sum, row) => sum + toNumber(row.total_cost), 0);
}

export function calculateFinancialSnapshot({
  sales,
  saleItems = [],
  products = [],
  otherIncome = [],
  expenses = [],
  savings = [],
  investments = [],
  investorFunds = [],
  restocks = [],
  openingCashBalance = 0,
}: {
  sales: SaleLike[];
  saleItems?: SaleItemLike[];
  products?: ProductLike[];
  otherIncome?: AmountLike[];
  expenses?: ExpenseLike[];
  savings?: AmountLike[];
  investments?: AmountLike[];
  investorFunds?: AmountLike[];
  restocks?: RestockLike[];
  openingCashBalance?: NumberLike;
}): FinancialSnapshot {
  const opening = toNumber(openingCashBalance);
  const paidSalesRevenue = calculateSalesIncome(sales);
  const cogs = calculateCOGS(sales, saleItems);
  const salesGrossProfit = paidSalesRevenue - cogs;
  const totalOtherIncome = calculateTotalOtherIncome(otherIncome);
  const totalInvestorFunds = calculateTotalOtherIncome(investorFunds);
  const totalIncome = paidSalesRevenue + totalOtherIncome + totalInvestorFunds;
  const operatingExpenses = calculateOperatingExpenses(expenses);
  const totalRestockSpending = calculateRestockSpending(restocks);
  const restockExpenseSpending = calculateRestockExpenseSpending(restocks);
  const totalSavings = calculateTotalExpenses(savings);
  const totalInvestments = calculateTotalExpenses(investments);
  const totalMoneyOut = operatingExpenses + totalRestockSpending + totalSavings + totalInvestments;
  const stockLeft = calculateStockLeft(products);
  const stockValueCost = calculateStockValue(products, 'cost');
  const stockValueSelling = calculateStockValue(products, 'selling');

  return {
    openingCashBalance: opening,
    paidSalesRevenue,
    cogs,
    salesGrossProfit,
    otherIncome: totalOtherIncome,
    investorFunds: totalInvestorFunds,
    totalIncome,
    operatingExpenses,
    restockExpenseSpending,
    totalSavings,
    totalInvestments,
    totalMoneyOut,
    availableBusinessMoney:
      opening + totalIncome - operatingExpenses - totalRestockSpending - totalSavings - totalInvestments,
    profit: paidSalesRevenue - cogs - operatingExpenses,
    stockLeft,
    stockValueCost,
    stockValueSelling,
    lowStockCount: calculateLowStockCount(products),
    negativeStockCount: calculateNegativeStockCount(products),
    totalRestockSpending,
  };
}

export function calculateAvailableBusinessMoney({
  sales,
  saleItems = [],
  products = [],
  otherIncome,
  expenses,
  savings,
  investments,
  investorFunds = [],
  restocks = [],
  openingCashBalance = 0,
}: {
  sales: SaleLike[];
  saleItems?: SaleItemLike[];
  products?: ProductLike[];
  otherIncome: AmountLike[];
  expenses: ExpenseLike[];
  savings: AmountLike[];
  investments: AmountLike[];
  investorFunds?: AmountLike[];
  restocks?: RestockLike[];
  openingCashBalance?: NumberLike;
}) {
  const snapshot = calculateFinancialSnapshot({
    sales,
    saleItems,
    products,
    otherIncome,
    expenses,
    savings,
    investments,
    investorFunds,
    restocks,
    openingCashBalance,
  });

  return {
    salesIncome: snapshot.paidSalesRevenue,
    otherIncome: snapshot.otherIncome,
    investorFunds: snapshot.investorFunds,
    totalIncome: snapshot.totalIncome,
    operatingExpenses: snapshot.operatingExpenses,
    restockExpenseSpending: snapshot.totalRestockSpending,
    totalSavings: snapshot.totalSavings,
    totalInvestments: snapshot.totalInvestments,
    availableBusinessMoney: snapshot.availableBusinessMoney,
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
  investorFunds = [],
  restocks = [],
}: {
  sales: SaleLike[];
  saleItems: SaleItemLike[];
  products: ProductLike[];
  otherIncome: AmountLike[];
  expenses: ExpenseLike[];
  savings: AmountLike[];
  investments: AmountLike[];
  investorFunds?: AmountLike[];
  restocks?: RestockLike[];
}) {
  const snapshot = calculateFinancialSnapshot({
    sales,
    saleItems,
    products,
    otherIncome,
    expenses,
    savings,
    investments,
    investorFunds,
    restocks,
  });

  return {
    availableBusinessMoney: snapshot.availableBusinessMoney,
    salesIncome: snapshot.paidSalesRevenue,
    otherIncome: snapshot.otherIncome,
    investorFunds: snapshot.investorFunds,
    totalIncome: snapshot.totalIncome,
    totalProfit: snapshot.profit,
    salesProfit: snapshot.salesGrossProfit,
    cogs: snapshot.cogs,
    totalExpenses: snapshot.operatingExpenses,
    restockExpenseSpending: snapshot.totalRestockSpending,
    stockLeft: snapshot.stockLeft,
    stockValueCost: snapshot.stockValueCost,
    lowStockCount: snapshot.lowStockCount,
    negativeStockCount: snapshot.negativeStockCount,
  };
}

export function calculateStockValue(products: ProductLike[], mode: 'cost' | 'selling' = 'selling') {
  return products.reduce((sum, product) => {
    const quantity = toNumber(product.quantity);
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
