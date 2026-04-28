import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { formatCurrency } from '@/lib/constants';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  HandCoins,
  LineChart as LineChartIcon,
  Minus,
  Package,
  PiggyBank,
  Receipt,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { SubscriptionBanner } from '@/components/SubscriptionBanner';
import { FirstTimeSetupDialog } from '@/components/FirstTimeSetupDialog';
import { useBusiness } from '@/context/BusinessContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { QuickTour } from '@/components/QuickTour';
import { cn } from '@/lib/utils';
import { DashboardAdsStrip, type DashboardAd } from '@/components/dashboard/DashboardAdsStrip';
import { calculateAvailableBusinessMoney } from '@/lib/business-money';

const DAY_MS = 86400000;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type Sale = {
  id: string;
  total: number | string;
  amount_paid: number | string;
  balance: number | string;
  sale_date: string;
  customer_name: string | null;
  payment_status: string;
  reference?: string | null;
};

type Expense = {
  id: string;
  amount: number | string;
  expense_date: string;
  category?: string | null;
  description?: string | null;
  reference?: string | null;
};

type Product = {
  quantity: number | null;
  reorder_level: number;
  selling_price?: number | string | null;
};

type SaleItem = {
  sale_id: string;
  cost_price: number | string;
  quantity: number;
};

type Savings = {
  id: string;
  amount: number | string;
  savings_date: string;
  source?: string | null;
  reference?: string | null;
};

type Investment = {
  id: string;
  amount: number | string;
  investment_date: string;
  investment_name?: string | null;
  reference?: string | null;
};

type Funding = {
  id: string;
  amount: number | string;
  date_received: string;
  investor_name?: string | null;
  reference?: string | null;
};

type Restock = {
  id: string;
  total_cost: number | string;
  quantity_added: number;
  restock_date: string;
};

type SaleDocument = {
  id: string;
  kind: string;
  issued_at: string;
};

type OtherIncome = {
  id: string;
  amount: number | string;
  income_date: string;
  category: string;
  payment_method?: string | null;
  description?: string | null;
  attachment_name?: string | null;
};

type RawData = {
  sales: Sale[];
  expenses: Expense[];
  products: Product[];
  saleItems: SaleItem[];
  savings: Savings[];
  investments: Investment[];
  funding: Funding[];
  restocks: Restock[];
  saleDocuments: SaleDocument[];
  otherIncome: OtherIncome[];
};

type Metrics = {
  totalRevenue: number;
  salesIncome: number;
  totalOtherIncome: number;
  totalIncome: number;
  salesProfit: number;
  totalProfit: number;
  totalExpenses: number;
  netProfit: number;
  outstandingBalance: number;
  lowStockCount: number;
  totalSavings: number;
  totalInvestments: number;
  totalFunding: number;
  totalRestockSpending: number;
  availableCash: number;
  qtySold: number;
  qtyRestocked: number;
  stockLeft: number;
  stockLeftValue: number;
};

type RecentTransaction = {
  id: string;
  label: string;
  sublabel: string;
  amount: number;
  direction: 'in' | 'out';
  date: string;
  icon: React.ComponentType<{ className?: string }>;
  toneClass: string;
};

function formatUtcDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthRange(month: number, year: number) {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  return {
    from: formatUtcDate(start),
    to: formatUtcDate(end),
    label: `${MONTH_NAMES[month]} ${year}`,
  };
}

function getYearRange(year: number) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  return {
    from: formatUtcDate(start),
    to: formatUtcDate(end),
    label: String(year),
  };
}

function getPreviousMonthRange(month: number, year: number) {
  const start = new Date(Date.UTC(year, month, 1));
  start.setUTCMonth(start.getUTCMonth() - 1);
  return getMonthRange(start.getUTCMonth(), start.getUTCFullYear());
}

function getPreviousYearRange(year: number) {
  return getYearRange(year - 1);
}

function inDateRange(dateStr: string, from: string, to: string): boolean {
  const date = new Date(dateStr).getTime();
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T23:59:59`).getTime();
  return date >= start && date <= end;
}

function buildReference(prefix: string, value?: string | null, id?: string | null) {
  if (value && value.trim()) return value.trim();
  return `${prefix}-${String(id ?? '').slice(0, 8).toUpperCase()}`;
}

function calcMetrics(
  sales: Sale[],
  expenses: Expense[],
  products: Product[],
  saleItems: SaleItem[],
  otherIncome: OtherIncome[],
  savings: Savings[],
  investments: Investment[],
  funding: Funding[],
  restocks: Restock[],
  saleDocuments: SaleDocument[],
): Metrics {
  const totalRevenue = sales.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
  const totalCost = saleItems.reduce((sum, item) => sum + Number(item.cost_price ?? 0) * Number(item.quantity ?? 0), 0);
  const salesProfit = totalRevenue - totalCost;
  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
  const moneySummary = calculateAvailableBusinessMoney({
    sales,
    otherIncome,
    expenses,
    savings,
    investments,
  });
  const totalProfit = salesProfit + moneySummary.otherIncome - totalExpenses;
  const netProfit = totalProfit;
  const outstandingBalance = sales.reduce((sum, row) => sum + Number(row.balance ?? 0), 0);
  const lowStockCount = products.filter((product) => Number(product.quantity ?? 0) <= Number(product.reorder_level ?? 0)).length;
  const totalSavings = savings.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const totalInvestments = investments.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const totalFunding = funding.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const totalRestockSpending = restocks.reduce((sum, row) => sum + Number(row.total_cost ?? 0), 0);
  const qtySold = saleItems.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  const qtyRestocked = restocks.reduce((sum, row) => sum + Number(row.quantity_added ?? 0), 0);
  const stockLeft = products.reduce((sum, product) => sum + Math.max(0, Number(product.quantity ?? 0)), 0);
  const stockLeftValue = products.reduce(
    (sum, product) => sum + Math.max(0, Number(product.quantity ?? 0)) * Number(product.selling_price ?? 0),
    0,
  );

  return {
    totalRevenue,
    salesIncome: moneySummary.salesIncome,
    totalOtherIncome: moneySummary.otherIncome,
    totalIncome: moneySummary.totalIncome,
    salesProfit,
    totalProfit,
    totalExpenses,
    netProfit,
    outstandingBalance,
    lowStockCount,
    totalSavings,
    totalInvestments,
    totalFunding,
    totalRestockSpending,
    availableCash: moneySummary.availableBusinessMoney,
    qtySold,
    qtyRestocked,
    stockLeft,
    stockLeftValue,
  };
}

function getGreeting(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getDisplayFirstName(displayName: string, fallback: string) {
  const source = displayName.trim() || fallback.trim();
  return source.split(/\s+/)[0] || 'there';
}

function getMetricDelta(
  current: number,
  previous: number,
  improveWhen: 'up' | 'down' = 'up',
  comparisonText = 'from last month',
  newPeriodText = 'New this period',
) {
  const difference = current - previous;
  if (Math.abs(difference) < 0.01) {
    return { state: 'neutral' as const, label: 'No change', icon: Minus };
  }
  if (Math.abs(previous) < 0.01) {
    const up = difference > 0;
    return {
      state: improveWhen === 'up' ? (up ? 'positive' : 'negative') : (up ? 'negative' : 'positive'),
      label: newPeriodText,
      icon: up ? ArrowUpRight : ArrowDownRight,
    };
  }

  const percent = Math.abs((difference / Math.abs(previous)) * 100);
  const direction = difference > 0 ? 'up' : 'down';
  return {
    state: improveWhen === direction ? 'positive' as const : 'negative' as const,
    label: `${percent.toFixed(1)}% ${comparisonText}`,
    icon: direction === 'up' ? ArrowUpRight : ArrowDownRight,
  };
}

function getDailySalesValue(sales: Sale[], date: Date) {
  const target = date.toISOString().slice(0, 10);
  return sales
    .filter((sale) => sale.sale_date.slice(0, 10) === target)
    .reduce((sum, sale) => sum + Number(sale.total ?? 0), 0);
}

function buildRecentTransactions({
  sales,
  expenses,
  otherIncome,
  savings,
  investments,
  funding,
}: {
  sales: Sale[];
  expenses: Expense[];
  otherIncome: OtherIncome[];
  savings: Savings[];
  investments: Investment[];
  funding: Funding[];
}): RecentTransaction[] {
  return [
    ...sales.map((sale) => ({
      id: `sale-${sale.id}`,
      label: `Sale - ${buildReference('SAL', sale.reference, sale.id)}`,
      sublabel: `${new Date(sale.sale_date).toLocaleDateString('en-GH')} • ${sale.customer_name || 'Walk-in'}`,
      amount: Number(sale.total ?? 0),
      direction: 'in' as const,
      date: sale.sale_date,
      icon: ShoppingCart,
      toneClass: 'bg-violet-500/15 text-violet-400',
    })),
    ...expenses.map((expense) => ({
      id: `expense-${expense.id}`,
      label: `Expense - ${buildReference('EXP', expense.reference, expense.id)}`,
      sublabel: `${new Date(expense.expense_date).toLocaleDateString('en-GH')} • ${expense.category || 'Expense'}`,
      amount: Number(expense.amount ?? 0),
      direction: 'out' as const,
      date: expense.expense_date,
      icon: Receipt,
      toneClass: 'bg-rose-500/15 text-rose-400',
    })),
    ...otherIncome.map((income) => ({
      id: `other-income-${income.id}`,
      label: `Other Income - ${buildReference('OTH', undefined, income.id)}`,
      sublabel: `${new Date(income.income_date).toLocaleDateString('en-GH')} • ${income.category}`,
      amount: Number(income.amount ?? 0),
      direction: 'in' as const,
      date: income.income_date,
      icon: HandCoins,
      toneClass: 'bg-emerald-500/15 text-emerald-400',
    })),
    ...savings.map((saving) => ({
      id: `saving-${saving.id}`,
      label: `Saving - ${buildReference('SAV', saving.reference, saving.id)}`,
      sublabel: `${new Date(saving.savings_date).toLocaleDateString('en-GH')} • ${saving.source || 'Savings transfer'}`,
      amount: Number(saving.amount ?? 0),
      direction: 'out' as const,
      date: saving.savings_date,
      icon: PiggyBank,
      toneClass: 'bg-emerald-500/15 text-emerald-400',
    })),
    ...investments.map((investment) => ({
      id: `investment-${investment.id}`,
      label: `Investment - ${buildReference('INV', investment.reference, investment.id)}`,
      sublabel: `${new Date(investment.investment_date).toLocaleDateString('en-GH')} • ${investment.investment_name || 'Investment'}`,
      amount: Number(investment.amount ?? 0),
      direction: 'out' as const,
      date: investment.investment_date,
      icon: TrendingUp,
      toneClass: 'bg-blue-500/15 text-blue-400',
    })),
    ...funding.map((entry) => ({
      id: `funding-${entry.id}`,
      label: `Investor Fund - ${buildReference('IF', entry.reference, entry.id)}`,
      sublabel: `${new Date(entry.date_received).toLocaleDateString('en-GH')} • ${entry.investor_name || 'Investor funding'}`,
      amount: Number(entry.amount ?? 0),
      direction: 'in' as const,
      date: entry.date_received,
      icon: HandCoins,
      toneClass: 'bg-amber-500/15 text-amber-400',
    })),
  ]
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, 5);
}

export default function Dashboard() {
  const now = new Date();
  const { business } = useBusiness();
  const { subscription, isReadOnly } = useSubscription();
  const { displayName, isAdmin, isManager } = useAuth();
  const navigate = useNavigate();
  const [raw, setRaw] = useState<RawData>({
    sales: [],
    expenses: [],
    products: [],
    saleItems: [],
    savings: [],
    investments: [],
    funding: [],
    restocks: [],
    saleDocuments: [],
    otherIncome: [],
  });
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(() => String(now.getFullYear()));
  const [chartType, setChartType] = useState<'bar' | 'line'>('line');
  const [tourOpen, setTourOpen] = useState(false);
  const [ads, setAds] = useState<DashboardAd[]>([]);
  const monthFilterActive = selectedMonth !== null;

  const selectedRange = useMemo(
    () => (monthFilterActive ? getMonthRange(Number(selectedMonth), Number(selectedYear)) : getYearRange(Number(selectedYear))),
    [monthFilterActive, selectedMonth, selectedYear],
  );
  const previousRange = useMemo(
    () => (monthFilterActive ? getPreviousMonthRange(Number(selectedMonth), Number(selectedYear)) : getPreviousYearRange(Number(selectedYear))),
    [monthFilterActive, selectedMonth, selectedYear],
  );
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const isCurrentYearView = Number(selectedYear) === currentYear && !monthFilterActive;

  const fetchData = useCallback(async () => {
    const [
      salesRes,
      expensesRes,
      productsRes,
      saleItemsRes,
      savingsRes,
      investRes,
      fundingRes,
      restockRes,
      saleDocsRes,
      otherIncomeRes,
    ] = await Promise.all([
      supabase.from('sales').select('*').order('sale_date', { ascending: false }),
      supabase.from('expenses').select('*'),
      supabase.from('products').select('*'),
      supabase.from('sale_items').select('*'),
      supabase.from('savings').select('*'),
      supabase.from('investments').select('*'),
      supabase.from('investor_funding').select('*'),
      supabase.from('restocks').select('*'),
      supabase.from('sale_documents' as any).select('id,kind,issued_at'),
      supabase.from('other_income' as any).select('*').order('income_date', { ascending: false }),
    ]);

    setRaw({
      sales: (salesRes.data as Sale[] | null) || [],
      expenses: (expensesRes.data as Expense[] | null) || [],
      products: (productsRes.data as Product[] | null) || [],
      saleItems: (saleItemsRes.data as SaleItem[] | null) || [],
      savings: (savingsRes.data as Savings[] | null) || [],
      investments: (investRes.data as Investment[] | null) || [],
      funding: (fundingRes.data as Funding[] | null) || [],
      restocks: (restockRes.data as Restock[] | null) || [],
      saleDocuments: (saleDocsRes.data as SaleDocument[] | null) || [],
      otherIncome: (otherIncomeRes.data as OtherIncome[] | null) || [],
    });
  }, []);

  const loadAds = useCallback(async () => {
    const { data } = await supabase
      .from('platform_ads' as any)
      .select('id,title,description,image_url,cta_text,cta_url')
      .eq('active', true)
      .order('sort_order')
      .order('created_at');
    setAds((data as DashboardAd[]) ?? []);
  }, []);

  useEffect(() => {
    void fetchData();
    void loadAds();
    const refresh = () => { void fetchData(); };
    const channel = supabase
      .channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'savings' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investments' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investor_funding' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restocks' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_documents' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'other_income' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_ads' }, () => { void loadAds(); })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchData, loadAds]);

  const setupRequired = (!!business && raw.products.length === 0) || !business;

  useEffect(() => {
    if (!setupRequired) {
      setSetupDialogOpen(false);
      setSetupDismissed(false);
      return;
    }
    if (!setupDismissed && (isAdmin || isManager || !business)) {
      setSetupDialogOpen(true);
    }
  }, [business, isAdmin, isManager, setupDismissed, setupRequired]);

  useEffect(() => {
    if (!business?.id) return;
    const key = `welcome-shown:${business.id}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    const timer = setTimeout(() => {
      toast.success(`Welcome to ${business.name}`, {
        description: 'Your workspace is ready. Take a quick tour to get started.',
        duration: 10000,
        action: {
          label: 'Quick tour',
          onClick: () => setTourOpen(true),
        },
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [business?.id, business?.name]);

  useEffect(() => {
    if (!subscription || !isReadOnly) return;
    const key = `upgrade-notice:${subscription.id}:${subscription.trial_end_date ?? subscription.current_period_end ?? 'ended'}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    const timer = setTimeout(() => {
      toast.warning('Your trial has ended', {
        description: 'Your records are still safe. Upgrade to continue full access.',
        duration: 12000,
        action: {
          label: 'Upgrade',
          onClick: () => navigate('/billing'),
        },
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [isReadOnly, navigate, subscription]);

  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear]);
    const dates = [
      ...raw.sales.map((sale) => sale.sale_date),
      ...raw.expenses.map((expense) => expense.expense_date),
      ...raw.savings.map((saving) => saving.savings_date),
      ...raw.investments.map((investment) => investment.investment_date),
      ...raw.funding.map((funding) => funding.date_received),
      ...raw.restocks.map((restock) => restock.restock_date),
      ...raw.saleDocuments.map((document) => document.issued_at),
      ...raw.otherIncome.map((entry) => entry.income_date),
    ];

    for (const value of dates) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) years.add(date.getFullYear());
    }

    return Array.from(years).sort((left, right) => right - left);
  }, [currentYear, raw.expenses, raw.funding, raw.investments, raw.otherIncome, raw.restocks, raw.saleDocuments, raw.sales, raw.savings]);

  const filtered = useMemo(() => {
    const sales = raw.sales.filter((sale) => inDateRange(sale.sale_date, selectedRange.from, selectedRange.to));
    const saleIds = new Set(sales.map((sale) => sale.id));
    return {
      sales,
      expenses: raw.expenses.filter((expense) => inDateRange(expense.expense_date, selectedRange.from, selectedRange.to)),
      saleItems: raw.saleItems.filter((item) => saleIds.has(item.sale_id)),
      savings: raw.savings.filter((saving) => inDateRange(saving.savings_date, selectedRange.from, selectedRange.to)),
      investments: raw.investments.filter((investment) => inDateRange(investment.investment_date, selectedRange.from, selectedRange.to)),
      funding: raw.funding.filter((funding) => inDateRange(funding.date_received, selectedRange.from, selectedRange.to)),
      restocks: raw.restocks.filter((restock) => inDateRange(restock.restock_date, selectedRange.from, selectedRange.to)),
      saleDocuments: raw.saleDocuments.filter((document) => inDateRange(document.issued_at, selectedRange.from, selectedRange.to)),
      otherIncome: raw.otherIncome.filter((entry) => inDateRange(entry.income_date, selectedRange.from, selectedRange.to)),
    };
  }, [raw, selectedRange.from, selectedRange.to]);

  const previous = useMemo(() => {
    const sales = raw.sales.filter((sale) => inDateRange(sale.sale_date, previousRange.from, previousRange.to));
    const saleIds = new Set(sales.map((sale) => sale.id));
    return {
      sales,
      expenses: raw.expenses.filter((expense) => inDateRange(expense.expense_date, previousRange.from, previousRange.to)),
      saleItems: raw.saleItems.filter((item) => saleIds.has(item.sale_id)),
      savings: raw.savings.filter((saving) => inDateRange(saving.savings_date, previousRange.from, previousRange.to)),
      investments: raw.investments.filter((investment) => inDateRange(investment.investment_date, previousRange.from, previousRange.to)),
      funding: raw.funding.filter((funding) => inDateRange(funding.date_received, previousRange.from, previousRange.to)),
      restocks: raw.restocks.filter((restock) => inDateRange(restock.restock_date, previousRange.from, previousRange.to)),
      saleDocuments: raw.saleDocuments.filter((document) => inDateRange(document.issued_at, previousRange.from, previousRange.to)),
      otherIncome: raw.otherIncome.filter((entry) => inDateRange(entry.income_date, previousRange.from, previousRange.to)),
    };
  }, [previousRange.from, previousRange.to, raw]);

  const activeMetrics = useMemo(
    () => calcMetrics(filtered.sales, filtered.expenses, raw.products, filtered.saleItems, filtered.otherIncome, filtered.savings, filtered.investments, filtered.funding, filtered.restocks, filtered.saleDocuments),
    [filtered, raw.products],
  );
  const previousMetrics = useMemo(
    () => calcMetrics(previous.sales, previous.expenses, raw.products, previous.saleItems, previous.otherIncome, previous.savings, previous.investments, previous.funding, previous.restocks, previous.saleDocuments),
    [previous, raw.products],
  );

  const chartData = useMemo(() => {
    if (!monthFilterActive) {
      return MONTH_NAMES.map((month, index) => {
        const sales = filtered.sales
          .filter((sale) => new Date(sale.sale_date).getMonth() === index)
          .reduce((sum, sale) => sum + Number(sale.total ?? 0), 0);
        return { name: month.slice(0, 3), sales };
      });
    }

    const start = new Date(`${selectedRange.from}T00:00:00`);
    const end = new Date(`${selectedRange.to}T00:00:00`);
    const dayCount = Math.max(1, Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1);
    return Array.from({ length: dayCount }, (_, index) => {
      const date = new Date(start.getTime() + index * DAY_MS);
      const dayStr = date.toISOString().slice(0, 10);
      const label = dayCount <= 10
        ? date.toLocaleDateString('en-GB', { weekday: 'short' })
        : date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
      const sales = filtered.sales
        .filter((sale) => sale.sale_date.slice(0, 10) === dayStr)
        .reduce((sum, sale) => sum + Number(sale.total ?? 0), 0);
      return { name: label, sales };
    });
  }, [filtered.sales, monthFilterActive, selectedRange.from, selectedRange.to]);

  const recentTransactions = useMemo(
    () =>
      buildRecentTransactions({
        sales: filtered.sales,
        expenses: filtered.expenses,
        otherIncome: filtered.otherIncome,
        savings: filtered.savings,
        investments: filtered.investments,
        funding: filtered.funding,
      }),
    [filtered.expenses, filtered.funding, filtered.investments, filtered.otherIncome, filtered.sales, filtered.savings],
  );
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const dailySalesValue = getDailySalesValue(raw.sales, now);
  const previousDailySalesValue = getDailySalesValue(raw.sales, yesterday);

  const greeting = getGreeting(now.getHours());
  const firstName = getDisplayFirstName(displayName, business?.name || 'there');
  const canLaunchSetup = !business || isAdmin || isManager;
  const showSetupShell = setupRequired;

  return (
    <AppLayout title="Dashboard">
      <QuickTour open={tourOpen} onOpenChange={setTourOpen} businessName={business?.name} />
      <FirstTimeSetupDialog
        open={setupDialogOpen && canLaunchSetup}
        onOpenChange={(open) => {
          setSetupDialogOpen(open);
          if (!open) setSetupDismissed(true);
        }}
        onCompleted={() => {
          setSetupDismissed(false);
          void fetchData();
        }}
      />

      <div className="space-y-6 animate-fade-in">
        <SubscriptionBanner />

        <section className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              {greeting}, {firstName}.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {showSetupShell
                ? `Let's get ${business?.name ?? 'your business'} ready for the first sale.`
                : `Here's what's happening across ${business?.name ?? 'your business'} in ${selectedRange.label}.`}
            </p>
          </div>

          {!showSetupShell ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/75 px-3 py-2 shadow-sm">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="h-9 w-[98px] border-0 bg-transparent px-2 shadow-none">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {monthFilterActive ? (
                <>
                  <Select value={selectedMonth ?? String(currentMonth)} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="h-9 w-[146px] border-0 bg-transparent px-2 shadow-none">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_NAMES.map((month, index) => (
                        <SelectItem key={month} value={String(index)}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedMonth(null)}>
                    Year only
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setSelectedMonth(String(currentMonth))}>
                  Add month
                </Button>
              )}
              {!isCurrentYearView ? (
                <Button variant="ghost" size="sm" onClick={() => { setSelectedMonth(null); setSelectedYear(String(currentYear)); }}>
                  This year
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => setTourOpen(true)}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Tour
              </Button>
            </div>
          ) : null}
        </section>

        {!showSetupShell ? <DashboardAdsStrip ads={ads} /> : null}

        {showSetupShell ? (
          <SetupStatePanel
            hasBusiness={!!business}
            canLaunchSetup={canLaunchSetup}
            onStartSetup={() => {
              setSetupDismissed(false);
              setSetupDialogOpen(true);
            }}
          />
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KpiMetricCard
                title="Available Business Money"
                value={activeMetrics.availableCash}
                footer={<MetricDeltaLine delta={getMetricDelta(activeMetrics.availableCash, previousMetrics.availableCash, 'up')} />}
                icon={Wallet}
                iconTone="bg-blue-500/15 text-blue-400"
              />
              <KpiMetricCard
                title="Daily Sales"
                value={dailySalesValue}
                footer={
                  <MetricDeltaLine
                    delta={getMetricDelta(
                      dailySalesValue,
                      previousDailySalesValue,
                      'up',
                      'vs yesterday',
                      'New today',
                    )}
                  />
                }
                icon={ShoppingCart}
                iconTone="bg-violet-500/15 text-violet-400"
              />
              <KpiMetricCard
                title="Total Profit"
                value={activeMetrics.totalProfit}
                footer={<MetricDeltaLine delta={getMetricDelta(activeMetrics.totalProfit, previousMetrics.totalProfit, 'up')} />}
                icon={TrendingUp}
                iconTone="bg-emerald-500/15 text-emerald-400"
              />
              <KpiMetricCard
                title="Stock Left"
                value={`${activeMetrics.stockLeft.toLocaleString('en-GH')} items`}
                isCurrency={false}
                footer={
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground/90">{formatCurrency(activeMetrics.stockLeftValue)} stock value</p>
                    <p className="text-xs text-muted-foreground">
                      {activeMetrics.lowStockCount > 0
                        ? `${activeMetrics.lowStockCount} low-stock item${activeMetrics.lowStockCount === 1 ? '' : 's'} need attention`
                        : 'Inventory levels are healthy'}
                    </p>
                  </div>
                }
                icon={activeMetrics.lowStockCount > 0 ? AlertTriangle : Package}
                iconTone={activeMetrics.lowStockCount > 0 ? 'bg-amber-500/15 text-amber-400' : 'bg-fuchsia-500/15 text-fuchsia-400'}
              />
            </section>

            <section className="grid gap-3 md:grid-cols-3">
              <IncomeBreakdownCard
                title="Sales Income"
                value={activeMetrics.salesIncome}
                subtitle="Paid sales only"
              />
              <IncomeBreakdownCard
                title="Other Income"
                value={activeMetrics.totalOtherIncome}
                subtitle="Service, delivery, commission, and more"
                tone="text-emerald-500"
              />
              <IncomeBreakdownCard
                title="Total Income"
                value={activeMetrics.totalIncome}
                subtitle="Sales income + other income"
                tone="text-primary"
              />
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.28fr_0.92fr]">
              <Card className="rounded-2xl">
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">Sales Overview</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">{selectedRange.label}</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1">
                    <Button
                      type="button"
                      variant={chartType === 'bar' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-8 gap-1.5 px-2"
                      onClick={() => setChartType('bar')}
                    >
                      <BarChart3 className="h-3.5 w-3.5" /> Bar
                    </Button>
                    <Button
                      type="button"
                      variant={chartType === 'line' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-8 gap-1.5 px-2"
                      onClick={() => setChartType('line')}
                    >
                      <LineChartIcon className="h-3.5 w-3.5" /> Line
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {chartData.some((day) => day.sales > 0) ? (
                    <ResponsiveContainer width="100%" height={330}>
                      {chartType === 'bar' ? (
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                          <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                          <Tooltip formatter={(value: number) => formatCurrency(value)} />
                          <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      ) : (
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                          <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                          <Tooltip formatter={(value: number) => formatCurrency(value)} />
                          <Line type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState
                      title="No sales yet"
                      description={`No sales were recorded for ${selectedRange.label}.`}
                      action={<Button asChild><Link to="/sales">Record sale</Link></Button>}
                    />
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">Recent Transactions</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">Latest activity across your key records.</p>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/reports">View all <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
                  </Button>
                </CardHeader>
                <CardContent>
                  {recentTransactions.length > 0 ? (
                    <div className="space-y-2">
                      {recentTransactions.map((transaction) => (
                        <RecentTransactionRow key={transaction.id} transaction={transaction} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="No transactions"
                      description={`No transactions were recorded for ${selectedRange.label}.`}
                    />
                  )}
                </CardContent>
              </Card>
            </section>
          </>
        )}

      </div>
    </AppLayout>
  );
}

function KpiMetricCard({
  title,
  value,
  footer,
  icon: Icon,
  iconTone,
  isCurrency = true,
}: {
  title: string;
  value: number | string;
  footer: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  iconTone: string;
  isCurrency?: boolean;
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight">{isCurrency ? formatCurrency(Number(value)) : value}</p>
          <div className="mt-3">{footer}</div>
        </div>
        <span className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-full', iconTone)}>
          <Icon className="h-6 w-6" />
        </span>
      </CardContent>
    </Card>
  );
}

function MetricDeltaLine({
  delta,
}: {
  delta: { state: 'positive' | 'negative' | 'neutral'; label: string; icon: React.ComponentType<{ className?: string }> };
}) {
  const DeltaIcon = delta.icon;
  const deltaTone = delta.state === 'positive'
    ? 'text-emerald-500'
    : delta.state === 'negative'
      ? 'text-destructive'
      : 'text-muted-foreground';

  return (
    <div className={cn('flex items-center gap-1.5 text-sm', deltaTone)}>
      <DeltaIcon className="h-4 w-4" />
      <span>{delta.label}</span>
    </div>
  );
}

function RecentTransactionRow({ transaction }: { transaction: RecentTransaction }) {
  const DirectionIcon = transaction.direction === 'in' ? ArrowUpRight : ArrowDownRight;
  const amountTone = transaction.direction === 'in' ? 'text-emerald-500' : 'text-destructive';

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', transaction.toneClass)}>
          <transaction.icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{transaction.label}</p>
          <p className="truncate text-xs text-muted-foreground">{transaction.sublabel}</p>
        </div>
      </div>
      <div className={cn('flex shrink-0 items-center gap-1 text-right text-sm font-semibold', amountTone)}>
        <span>{formatCurrency(transaction.amount)}</span>
        <DirectionIcon className="h-4 w-4" />
      </div>
    </div>
  );
}

function IncomeBreakdownCard({
  title,
  value,
  subtitle,
  tone,
}: {
  title: string;
  value: number;
  subtitle: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
      <p className={cn('mt-2 text-xl font-bold', tone)}>{formatCurrency(value)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function SetupStatePanel({
  hasBusiness,
  canLaunchSetup,
  onStartSetup,
}: {
  hasBusiness: boolean;
  canLaunchSetup: boolean;
  onStartSetup: () => void;
}) {
  return (
    <Card className="rounded-2xl border-primary/20 bg-card/85">
      <CardContent className="space-y-6 p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">First-time setup</p>
            <h3 className="text-2xl font-bold tracking-tight">
              {hasBusiness ? 'Add your first product to start selling' : 'Set up your workspace and first product'}
            </h3>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {hasBusiness
                ? 'Your business is ready. Add the first product now so inventory appears, the dashboard gets real data, and sales can start immediately.'
                : 'We will name the business, stock the first product, and bring you right back to a dashboard with real inventory data.'}
            </p>
          </div>

          <Button onClick={onStartSetup} disabled={!canLaunchSetup}>
            {hasBusiness ? 'Add first product' : 'Start setup'}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <SetupStepCard
            step="1"
            title={hasBusiness ? 'Business ready' : 'Business name'}
            description={hasBusiness ? 'We keep your workspace and move straight into inventory.' : 'Name the business once so receipts and reports look right.'}
            icon={Store}
          />
          <SetupStepCard
            step="2"
            title="Add first product"
            description="Capture product name, cost, selling price, and opening stock in one pass."
            icon={Package}
          />
          <SetupStepCard
            step="3"
            title="Confirm setup"
            description="Save everything and land on a dashboard that is ready for the first sale."
            icon={CheckCircle2}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SetupStepCard({
  step,
  title,
  description,
  icon: Icon,
}: {
  step: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/70 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Step {step}</p>
          <p className="text-sm font-semibold text-foreground">{title}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
