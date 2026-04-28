type AmountLike = {
  amount?: number | string | null;
};

type SaleLike = {
  total?: number | string | null;
  amount_paid?: number | string | null;
  payment_status?: string | null;
  status?: string | null;
  order_status?: string | null;
  fulfillment_status?: string | null;
  delivery_status?: string | null;
};

function asNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}

function isCancelledSale(sale: SaleLike) {
  return [
    sale.payment_status,
    sale.status,
    sale.order_status,
    sale.fulfillment_status,
    sale.delivery_status,
  ].some((value) => normalize(value) === 'cancelled');
}

function isCompletedOrDeliveredSale(sale: SaleLike) {
  const statuses = [
    sale.status,
    sale.order_status,
    sale.fulfillment_status,
    sale.delivery_status,
  ]
    .map(normalize)
    .filter(Boolean);

  if (statuses.length === 0) return true;
  return statuses.some((status) => status === 'completed' || status === 'delivered');
}

export function getRecognizedSalesIncome(sales: SaleLike[]) {
  return sales.reduce((sum, sale) => {
    if (isCancelledSale(sale) || !isCompletedOrDeliveredSale(sale)) return sum;

    const total = Math.max(0, asNumber(sale.total));
    const amountPaid = Math.max(0, asNumber(sale.amount_paid));
    const paymentStatus = normalize(sale.payment_status);

    if (paymentStatus === 'unpaid') return sum;
    if (paymentStatus === 'paid') {
      const recognized = amountPaid > 0 ? Math.min(amountPaid, total || amountPaid) : total;
      return sum + recognized;
    }
    if (paymentStatus === 'partial') {
      return sum + Math.min(amountPaid, total || amountPaid);
    }

    if (amountPaid > 0) {
      return sum + Math.min(amountPaid, total || amountPaid);
    }

    return sum;
  }, 0);
}

export function sumAmounts<T extends AmountLike>(rows: T[]) {
  return rows.reduce((sum, row) => sum + asNumber(row.amount), 0);
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
  const salesIncome = getRecognizedSalesIncome(sales);
  const otherIncomeTotal = sumAmounts(otherIncome);
  const totalIncome = salesIncome + otherIncomeTotal;
  const totalExpenses = sumAmounts(expenses);
  const totalSavings = sumAmounts(savings);
  const totalInvestments = sumAmounts(investments);

  return {
    salesIncome,
    otherIncome: otherIncomeTotal,
    totalIncome,
    availableBusinessMoney: totalIncome - totalExpenses - totalSavings - totalInvestments,
  };
}
