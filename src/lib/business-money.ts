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
  'Business-wide cash: paid sales + other income + investor funds - expenses - restocks - savings - investments';

export type AvailableBusinessMoneyArgs = Parameters<typeof calculateFinancialSnapshot>[0];

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

export function warnIfFinancialInconsistency(context: string, expected: number, actual: number) {
  if (Math.abs(expected - actual) > 0.01) {
    console.warn('Financial inconsistency detected', {
      context,
      expected,
      actual,
    });
  }
}
