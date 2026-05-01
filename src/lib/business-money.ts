import {
  calculateAvailableBusinessMoney,
  calculateFinancialSnapshot,
  calculateSalesIncome,
  calculateTotalOtherIncome,
  normalizeText,
  toNumber,
} from '@/lib/sales-inventory';

export {
  calculateAvailableBusinessMoney,
  calculateFinancialSnapshot,
  normalizeText,
  toNumber,
};

export const AVAILABLE_BUSINESS_MONEY_FORMULA =
  'Business-wide cash: paid sales + other income + investor funds - expenses - expensed restocks - savings - investments';

export function getRecognizedSalesIncome(...args: Parameters<typeof calculateSalesIncome>) {
  return calculateSalesIncome(...args);
}

export function sumAmounts(...args: Parameters<typeof calculateTotalOtherIncome>) {
  return calculateTotalOtherIncome(...args);
}

export function calculateBusinessWideAvailableMoney(
  ...args: Parameters<typeof calculateFinancialSnapshot>
) {
  return calculateFinancialSnapshot(...args).availableBusinessMoney;
}
