export const formatCurrency = (amount: number) =>
  `GH₵ ${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const EXPENSE_CATEGORIES = [
  'Rent', 'Transport', 'Electricity', 'Packaging', 'Internet',
  'Salaries', 'Supplies', 'Marketing', 'Miscellaneous',
] as const;

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'momo', label: 'Mobile Money' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
] as const;

export const PAYMENT_STATUSES = [
  { value: 'paid', label: 'Paid', color: 'bg-success text-success-foreground' },
  { value: 'partial', label: 'Partial', color: 'bg-warning text-warning-foreground' },
  { value: 'unpaid', label: 'Unpaid', color: 'bg-destructive text-destructive-foreground' },
] as const;
