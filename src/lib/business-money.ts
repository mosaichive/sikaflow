import {
  calculateAvailableBusinessMoney as calculateAvailableBusinessMoneyBreakdownBase,
  calculateFinancialSnapshot,
  calculateSalesIncome,
  calculateTotalOtherIncome,
  normalizeText,
  toNumber,
} from '@/lib/sales-inventory';

export {
  calculateFinancialSnapshot,
  normalizeText,
  toNumber,
};

export const AVAILABLE_BUSINESS_MONEY_FORMULA =
  'Opening cash balance + paid sales + other income + investor funds - expenses - all normal restocks - savings - investments';

export type AvailableBusinessMoneyArgs = Parameters<typeof calculateFinancialSnapshot>[0];

export type BusinessFinancials = {
  openingCash: number;
  availableBusinessMoney: number;
  paidSalesRevenue: number;
  otherIncome: number;
  investorFunds: number;
  expenses: number;
  restockSpending: number;
  savings: number;
  investments: number;
  profit: number;
  stockValue: number;
  stockLeft: number;
  cogs: number;
  totalIncome: number;
  lowStockCount: number;
  negativeStockCount: number;
};

export function getRecognizedSalesIncome(...args: Parameters<typeof calculateSalesIncome>) {
  return calculateSalesIncome(...args);
}

export function sumAmounts(...args: Parameters<typeof calculateTotalOtherIncome>) {
  return calculateTotalOtherIncome(...args);
}

export function calculateAvailableBusinessMoneyBreakdown(args: AvailableBusinessMoneyArgs) {
  return calculateAvailableBusinessMoneyBreakdownBase(args);
}

export function calculateAvailableBusinessMoney(args: AvailableBusinessMoneyArgs) {
  return calculateAvailableBusinessMoneyBreakdown(args).availableBusinessMoney;
}

export function calculateBusinessFinancials(args: AvailableBusinessMoneyArgs): BusinessFinancials {
  const snapshot = calculateFinancialSnapshot(args);

  return {
    openingCash: snapshot.openingCashBalance,
    availableBusinessMoney: snapshot.availableBusinessMoney,
    paidSalesRevenue: snapshot.paidSalesRevenue,
    otherIncome: snapshot.otherIncome,
    investorFunds: snapshot.investorFunds,
    expenses: snapshot.operatingExpenses,
    restockSpending: snapshot.totalRestockSpending,
    savings: snapshot.totalSavings,
    investments: snapshot.totalInvestments,
    profit: snapshot.profit,
    stockValue: snapshot.stockValueCost,
    stockLeft: snapshot.stockLeft,
    cogs: snapshot.cogs,
    totalIncome: snapshot.totalIncome,
    lowStockCount: snapshot.lowStockCount,
    negativeStockCount: snapshot.negativeStockCount,
  };
}

export function warnIfFinancialInconsistency(context: string, expected: number, actual: number) {
  if (Math.abs(expected - actual) > 0.01) {
    console.warn('Financial inconsistency detected', {
      context,
      expected,
      actual,
    });
  }
}
