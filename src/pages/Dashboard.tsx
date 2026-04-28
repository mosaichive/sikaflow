import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, HandCoins, Package, Receipt, ShoppingCart, TrendingUp, Wallet } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { FirstTimeSetupDialog } from '@/components/FirstTimeSetupDialog';
import { SubscriptionBanner } from '@/components/SubscriptionBanner';
import { useBusiness } from '@/context/BusinessContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency, SIKAFLOW_TOOLTIPS } from '@/lib/constants';
import { calculateDashboardTotals, getPaidAmount, getIsoDate, normalizeText, sumTodaySales, toNumber } from '@/lib/sales-inventory';
import { cn } from '@/lib/utils';

type SaleRow = {
  id: string;
  sale_date: string;
  total: number | string;
  amount_paid: number | string;
  payment_status: string;
  status?: string | null;
  customer_name?: string | null;
  reference?: string | null;
};

type SaleItemRow = {
  id: string;
  sale_id: string;
  product_name: string;
  quantity: number;
  unit_price: number | string;
  cost_price: number | string;
  line_total: number | string;
};

type ProductRow = {
  id: string;
  name: string;
  quantity: number | null;
  selling_price: number | string | null;
  low_stock_threshold?: number | null;
  reorder_level?: number | null;
  is_archived?: boolean | null;
};

type ExpenseRow = {
  id: string;
  amount: number | string;
  description?: string | null;
  category?: string | null;
  expense_date: string;
};

type OtherIncomeRow = {
  id: string;
  amount: number | string;
  category: string;
  description?: string | null;
  income_date: string;
};

type SavingsRow = { amount: number | string; savings_date: string };
type InvestmentRow = { amount: number | string; investment_date: string };

type DashboardData = {
  sales: SaleRow[];
  saleItems: SaleItemRow[];
  products: ProductRow[];
  expenses: ExpenseRow[];
  otherIncome: OtherIncomeRow[];
  savings: SavingsRow[];
  investments: InvestmentRow[];
};

function startOfYear(year: number) {
  return `${year}-01-01`;
}

function endOfYear(year: number) {
  return `${year}-12-31`;
}

function startOfMonth(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

function endOfMonth(year: number, month: number) {
  const date = new Date(Date.UTC(year, month + 1, 0));
  return date.toISOString().slice(0, 10);
}

function inRange(value: string | null | undefined, from: string, to: string) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= new Date(`${from}T00:00:00`).getTime() && time <= new Date(`${to}T23:59:59`).getTime();
}

function buildDailyDelta(today: number, yesterday: number) {
  const difference = today - yesterday;
  if (Math.abs(difference) < 0.01) {
    return { label: 'No change vs yesterday', tone: 'muted', icon: TrendingUp };
  }
  if (difference > 0) {
    return { label: `${formatCurrency(difference)} more than yesterday`, tone: 'up', icon: ArrowUpRight };
  }
  return { label: `${formatCurrency(Math.abs(difference))} below yesterday`, tone: 'down', icon: ArrowDownRight };
}

function buildRecentActivity(data: DashboardData, from: string, to: string) {
  const entries = [
    ...data.sales
      .filter((sale) => inRange(sale.sale_date, from, to))
      .map((sale) => ({
        id: `sale-${sale.id}`,
        title: sale.customer_name ? `Sale to ${sale.customer_name}` : 'Walk-in sale',
        subtitle: new Date(sale.sale_date).toLocaleDateString('en-GH'),
        amount: getPaidAmount(sale),
        direction: 'in' as const,
        date: sale.sale_date,
        icon: ShoppingCart,
        tone: 'text-emerald-500',
      })),
    ...data.otherIncome
      .filter((row) => inRange(row.income_date, from, to))
      .map((row) => ({
        id: `income-${row.id}`,
        title: row.category,
        subtitle: row.description || new Date(row.income_date).toLocaleDateString('en-GH'),
        amount: toNumber(row.amount),
        direction: 'in' as const,
        date: row.income_date,
        icon: HandCoins,
        tone: 'text-emerald-500',
      })),
    ...data.expenses
      .filter((row) => inRange(row.expense_date, from, to))
      .map((row) => ({
        id: `expense-${row.id}`,
        title: row.category || 'Expense',
        subtitle: row.description || new Date(row.expense_date).toLocaleDateString('en-GH'),
        amount: toNumber(row.amount),
        direction: 'out' as const,
        date: row.expense_date,
        icon: Receipt,
        tone: 'text-rose-500',
      })),
  ];

  return entries
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, 6);
}

function buildSalesChart(sales: SaleRow[], year: number, month: number | null) {
  const grouped = new Map<string, number>();

  if (month === null) {
    for (let index = 0; index < 12; index += 1) {
      grouped.set(new Date(Date.UTC(year, index, 1)).toLocaleDateString('en-GH', { month: 'short' }), 0);
    }

    sales.forEach((sale) => {
      const date = new Date(sale.sale_date);
      if (date.getFullYear() !== year) return;
      const key = new Date(Date.UTC(year, date.getMonth(), 1)).toLocaleDateString('en-GH', { month: 'short' });
      grouped.set(key, (grouped.get(key) || 0) + getPaidAmount(sale));
    });
  } else {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      grouped.set(String(day).padStart(2, '0'), 0);
    }

    sales.forEach((sale) => {
      const date = new Date(sale.sale_date);
      if (date.getFullYear() !== year || date.getMonth() !== month) return;
      const key = String(date.getDate()).padStart(2, '0');
      grouped.set(key, (grouped.get(key) || 0) + getPaidAmount(sale));
    });
  }

  return Array.from(grouped.entries()).map(([label, value]) => ({ label, value }));
}

function MetricCard({
  title,
  value,
  icon: Icon,
  helper,
  tooltip,
  valueClassName,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  helper: string;
  tooltip?: string;
  valueClassName?: string;
}) {
  return (
    <Card className="border-border/70 bg-card/85">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              {tooltip ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-xs text-muted-foreground underline decoration-dotted underline-offset-4">
                      Info
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-sm">
                    {tooltip}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
            <p className={cn('text-3xl font-semibold tracking-tight text-foreground', valueClassName)}>{value}</p>
            <p className="text-sm text-muted-foreground">{helper}</p>
          </div>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const { business } = useBusiness();
  const { isAdmin, isManager, displayName } = useAuth();
  const [data, setData] = useState<DashboardData>({
    sales: [],
    saleItems: [],
    products: [],
    expenses: [],
    otherIncome: [],
    savings: [],
    investments: [],
  });
  const [loading, setLoading] = useState(true);
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const year = Number(selectedYear);
  const month = selectedMonth === null ? null : Number(selectedMonth);
  const dateRange = month === null
    ? { from: startOfYear(year), to: endOfYear(year), label: String(year) }
    : { from: startOfMonth(year, month), to: endOfMonth(year, month), label: `${new Date(year, month, 1).toLocaleDateString('en-GH', { month: 'long', year: 'numeric' })}` };

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    const [salesRes, saleItemsRes, productsRes, expensesRes, otherIncomeRes, savingsRes, investmentsRes] = await Promise.all([
      supabase.from('sales').select('*').order('sale_date', { ascending: false }),
      supabase.from('sale_items').select('*'),
      supabase.from('products').select('*').eq('is_archived', false).order('name'),
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('other_income' as any).select('*').order('income_date', { ascending: false }),
      supabase.from('savings').select('amount,savings_date'),
      supabase.from('investments').select('amount,investment_date'),
    ]);

    setData({
      sales: (salesRes.data || []) as SaleRow[],
      saleItems: (saleItemsRes.data || []) as SaleItemRow[],
      products: (productsRes.data || []) as ProductRow[],
      expenses: (expensesRes.data || []) as ExpenseRow[],
      otherIncome: (otherIncomeRes.data || []) as OtherIncomeRow[],
      savings: (savingsRes.data || []) as SavingsRow[],
      investments: (investmentsRes.data || []) as InvestmentRow[],
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchDashboard();
    const refresh = () => { void fetchDashboard(); };
    const channel = supabase
      .channel('dashboard-sales-inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'other_income' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'savings' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investments' }, refresh)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchDashboard]);

  const setupRequired = (!!business && data.products.length === 0) || !business;

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

  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear]);
    const values = [
      ...data.sales.map((row) => row.sale_date),
      ...data.expenses.map((row) => row.expense_date),
      ...data.otherIncome.map((row) => row.income_date),
      ...data.savings.map((row) => row.savings_date),
      ...data.investments.map((row) => row.investment_date),
    ];
    values.forEach((value) => {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) years.add(parsed.getFullYear());
    });
    return Array.from(years).sort((left, right) => right - left);
  }, [currentYear, data.expenses, data.investments, data.otherIncome, data.sales, data.savings]);

  const filtered = useMemo(() => {
    const sales = data.sales.filter((row) => inRange(row.sale_date, dateRange.from, dateRange.to));
    const saleIds = new Set(sales.map((row) => row.id));
    return {
      sales,
      saleItems: data.saleItems.filter((item) => saleIds.has(item.sale_id)),
      expenses: data.expenses.filter((row) => inRange(row.expense_date, dateRange.from, dateRange.to)),
      otherIncome: data.otherIncome.filter((row) => inRange(row.income_date, dateRange.from, dateRange.to)),
      savings: data.savings.filter((row) => inRange(row.savings_date, dateRange.from, dateRange.to)),
      investments: data.investments.filter((row) => inRange(row.investment_date, dateRange.from, dateRange.to)),
      products: data.products,
    };
  }, [data, dateRange.from, dateRange.to]);

  const metrics = useMemo(() => calculateDashboardTotals(filtered), [filtered]);
  const dailySales = useMemo(() => sumTodaySales(data.sales), [data.sales]);
  const yesterdaySales = useMemo(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return sumTodaySales(data.sales, yesterday);
  }, [data.sales]);
  const dailyDelta = useMemo(() => buildDailyDelta(dailySales, yesterdaySales), [dailySales, yesterdaySales]);

  const salesChartData = useMemo(() => buildSalesChart(filtered.sales, year, month), [filtered.sales, month, year]);
  const recentActivity = useMemo(() => buildRecentActivity(data, dateRange.from, dateRange.to), [data, dateRange.from, dateRange.to]);
  const lowStockProducts = useMemo(
    () =>
      data.products
        .filter((product) => !product.is_archived && toNumber(product.quantity) <= toNumber(product.low_stock_threshold ?? product.reorder_level ?? 0))
        .slice(0, 4),
    [data.products],
  );

  if (loading) {
    return (
      <AppLayout title="Dashboard">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="h-36 animate-pulse bg-muted/40" />
          ))}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Dashboard">
      <div className="space-y-6">
        <SubscriptionBanner />

        <section className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/75 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-primary">Sales & Inventory</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Welcome back, {(displayName || business?.name || 'there').split(' ')[0]}.
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Keep today&apos;s selling, stock position, expenses, and extra income in one place. This dashboard only reflects paid sales and real inventory activity.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedMonth === null ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedMonth(String(currentMonth))}>
                Add month
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedMonth(null)}>
                Year only
              </Button>
            )}

            {selectedMonth !== null ? (
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }).map((_, index) => (
                    <SelectItem key={index} value={String(index)}>
                      {new Date(2000, index, 1).toLocaleDateString('en-GH', { month: 'long' })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((availableYear) => (
                  <SelectItem key={availableYear} value={String(availableYear)}>
                    {availableYear}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            title="Available Business Money"
            value={formatCurrency(metrics.availableBusinessMoney)}
            icon={Wallet}
            helper="Paid sales + other income - expenses - savings - investments"
            tooltip={SIKAFLOW_TOOLTIPS.availableBusinessMoney}
          />
          <MetricCard
            title="Daily Sales"
            value={formatCurrency(dailySales)}
            icon={ShoppingCart}
            helper={dailyDelta.label}
            valueClassName={dailyDelta.tone === 'up' ? 'text-emerald-500' : dailyDelta.tone === 'down' ? 'text-rose-500' : undefined}
          />
          <MetricCard
            title="Total Profit"
            value={formatCurrency(metrics.totalProfit)}
            icon={TrendingUp}
            helper="Sales profit + other income - expenses"
            tooltip={SIKAFLOW_TOOLTIPS.profit}
          />
          <MetricCard
            title="Stock Left"
            value={metrics.stockLeft.toLocaleString('en-GH')}
            icon={Boxes}
            helper="Current inventory quantity across active products"
          />
          <MetricCard
            title="Other Income"
            value={formatCurrency(metrics.otherIncome)}
            icon={HandCoins}
            helper="Service, delivery fee, commission, and miscellaneous income"
            tooltip={SIKAFLOW_TOOLTIPS.otherIncome}
          />
          <MetricCard
            title="Low Stock Alerts"
            value={metrics.lowStockCount.toLocaleString('en-GH')}
            icon={AlertTriangle}
            helper={lowStockProducts.length > 0 ? lowStockProducts.map((product) => product.name).join(', ') : 'No low stock products right now'}
            valueClassName={metrics.lowStockCount > 0 ? 'text-amber-500' : undefined}
          />
        </div>

        {setupRequired ? (
          <EmptyState
            icon={<Package className="h-7 w-7 text-muted-foreground" />}
            title="Add your first product to start selling"
            description="Set up your business and opening stock so the dashboard can show live figures instead of an empty workspace."
            action={<Button onClick={() => setSetupDialogOpen(true)}>Start setup</Button>}
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
            <Card className="border-border/70">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Sales Overview</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Paid sales in {dateRange.label}</p>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                {salesChartData.some((item) => item.value > 0) ? (
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={salesChartData} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} />
                        <YAxis
                          tickFormatter={(value) => `GH₵${Math.round(value / 1000)}k`}
                          tickLine={false}
                          axisLine={false}
                          width={70}
                        />
                        <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                        <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-[320px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
                    No paid sales recorded for this period yet.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Recent Activity</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Sales, other income, and expenses within {dateRange.label}</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                {recentActivity.length > 0 ? (
                  recentActivity.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/15 p-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <entry.icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{entry.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{entry.subtitle}</p>
                      </div>
                      <p className={cn('text-sm font-semibold', entry.tone)}>
                        {entry.direction === 'in' ? '+' : '-'}
                        {formatCurrency(entry.amount)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
                    No activity for this period yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <FirstTimeSetupDialog
          open={setupDialogOpen}
          onOpenChange={(nextOpen) => {
            setSetupDialogOpen(nextOpen);
            if (!nextOpen && setupRequired) setSetupDismissed(true);
          }}
          onCompleted={() => {
            setSetupDismissed(false);
            void fetchDashboard();
          }}
        />
      </div>
    </AppLayout>
  );
}
