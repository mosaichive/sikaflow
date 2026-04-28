export const formatCurrency = (amount: number) =>
  `GH₵ ${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const EXPENSE_CATEGORIES = [
  'Rent', 'Transport', 'Electricity', 'Packaging', 'Internet',
  'Salaries', 'Supplies', 'Marketing', 'Miscellaneous',
] as const;

export const BUSINESS_TYPES = [
  'Retail Shop',
  'Fashion & Apparel',
  'Provision Store',
  'Electronics',
  'Pharmacy',
  'Restaurant',
  'Beauty & Cosmetics',
  'Wholesale',
  'Services',
  'Other',
] as const;

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'momo', label: 'Mobile Money' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
] as const;

export const OTHER_INCOME_CATEGORIES = [
  'Service',
  'Delivery Fee',
  'Commission',
  'Discount Recovery',
  'Miscellaneous',
] as const;

export const PAYMENT_STATUSES = [
  { value: 'paid', label: 'Paid', color: 'bg-success text-success-foreground' },
  { value: 'partial', label: 'Partial', color: 'bg-warning text-warning-foreground' },
  { value: 'unpaid', label: 'Unpaid', color: 'bg-destructive text-destructive-foreground' },
  { value: 'overdue', label: 'Overdue', color: 'bg-destructive text-destructive-foreground' },
] as const;

export const ORDER_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'processing', label: 'Processing' },
  { value: 'ready_for_pickup', label: 'Ready for Pickup' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export const STOCK_MOVEMENT_TYPES = [
  { value: 'opening_stock', label: 'Opening Stock' },
  { value: 'restock', label: 'Restock' },
  { value: 'sale', label: 'Sale' },
  { value: 'return', label: 'Return' },
  { value: 'damaged_stock', label: 'Damaged Stock' },
  { value: 'manual_adjustment', label: 'Manual Adjustment' },
] as const;

export const SIKAFLOW_TOOLTIPS = {
  openingStock: 'Opening Stock is the inventory you already have on hand when you start using SikaFlow. It affects stock and profit cost basis, but it is not income or cash.',
  otherIncome: 'Other Income is business income that does not come from product sales, like services, delivery fees, commissions, or miscellaneous charges.',
  availableBusinessMoney: 'Available Business Money is the cash the business can work with right now after paid sales and other income, minus expenses, savings, and investments.',
  profit: 'Profit is what remains after product cost and expenses are removed from paid sales, then adjusted with any other income.',
} as const;
