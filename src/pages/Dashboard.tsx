import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { formatCurrency } from '@/lib/constants';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  DollarSign,
  LineChart as LineChartIcon,
  Package,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { SubscriptionBanner } from '@/components/SubscriptionBanner';
import { BusinessOnboardingDialog } from '@/components/BusinessOnboardingDialog';
import { useBusiness } from '@/context/BusinessContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { toast } from 'sonner';
import { QuickTour } from '@/components/QuickTour';
import { cn } from '@/lib/utils';

const DAY_MS = 86400000;

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoInputValue(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

interface Sale {
  id: string;
  total: number | string;
  balance: number | string;
  sale_date: string;
  customer_name: string | null;
  payment_status: string;
}

interface Expense {
  amount: number | string;
  expense_date: string;
}

interface Product {
  quantity: number | null;
  reorder_level: number;
}

interface SaleItem {
  sale_id: string;
  cost_price: number | string;
  quantity: number;
}

interface Savings {
  amount: number | string;
  savings_date: string;
}

interface Investment {
  amount: number | string;
  investment_date: string;
}

interface Funding {
  amount: number | string;
  date_received: string;
}

interface Restock {
  total_cost: number | string;
  quantity_added: number;
  restock_date: string;
}

interface RawData {
  sales: Sale[];
  expenses: Expense[];
  products: Product[];
  saleItems: SaleItem[];
  savings: Savings[];
  investments: Investment[];
  funding: Funding[];
  restocks: Restock[];
}

interface Metrics {
  totalRevenue: number;
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
}

function inDateRange(dateStr: string, from: string, to: string): boolean {
  if (!from || !to) return true;
  const date = new Date(dateStr).getTime();
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T23:59:59`).getTime();
  return date >= start && date <= end;
}

function formatDateRange(from: string, to: string) {
  if (!from || !to) return 'All dates';
  const formatOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${new Date(`${from}T00:00:00`).toLocaleDateString('en-GB', formatOptions)} - ${new Date(`${to}T00:00:00`).toLocaleDateString('en-GB', formatOptions)}`;
}

function calcMetrics(
  sales: Sale[],
  expenses: Expense[],
  products: Product[],
  saleItems: SaleItem[],
  savings: Savings[],
  investments: Investment[],
  funding: Funding[],
  restocks: Restock[],
): Metrics {
  const totalRevenue = sales.reduce((sum, row) => sum + Number(row.total), 0);
  const totalCost = saleItems.reduce((sum, item) => sum + Number(item.cost_price) * item.quantity, 0);
  const totalProfit = totalRevenue - totalCost;
  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const netProfit = totalProfit - totalExpenses;
  const outstandingBalance = sales.reduce((sum, row) => sum + Number(row.balance), 0);
  const lowStockCount = products.filter((product) => product.quantity <= product.reorder_level).length;
  const totalSavings = savings.reduce((sum, row) => sum + Number(row.amount), 0);
  const totalInvestments = investments.reduce((sum, row) => sum + Number(row.amount), 0);
  const totalFunding = funding.reduce((sum, row) => sum + Number(row.amount), 0);
  const totalRestockSpending = restocks.reduce((sum, row) => sum + Number(row.total_cost), 0);
  const availableCash = totalRevenue + totalFunding - totalExpenses - totalSavings - totalInvestments - totalRestockSpending;
  const qtySold = saleItems.reduce((sum, item) => sum + item.quantity, 0);
  const qtyRestocked = restocks.reduce((sum, row) => sum + row.quantity_added, 0);
  const stockLeft = products.reduce((sum, product) => sum + Math.max(0, Number(product.quantity) || 0), 0);

  return {
    totalRevenue,
    totalProfit,
    totalExpenses,
    netProfit,
    outstandingBalance,
    lowStockCount,
    totalSavings,
    totalInvestments,
    totalFunding,
    totalRestockSpending,
    availableCash,
    qtySold,
    qtyRestocked,
    stockLeft,
  };
}

export default function Dashboard() {
  const [raw, setRaw] = useState<RawData>({
    sales: [],
    expenses: [],
    products: [],
    saleItems: [],
    savings: [],
    investments: [],
    funding: [],
    restocks: [],
  });
  const [dateFrom, setDateFrom] = useState(() => daysAgoInputValue(6));
  const [dateTo, setDateTo] = useState(() => todayInputValue());
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [tourOpen, setTourOpen] = useState(false);
  const { business } = useBusiness();
  const { subscription, isReadOnly } = useSubscription();
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    const [salesRes, expensesRes, productsRes, saleItemsRes, savingsRes, investRes, fundingRes, restockRes] = await Promise.all([
      supabase.from('sales').select('*').order('sale_date', { ascending: false }),
      supabase.from('expenses').select('*'),
      supabase.from('products').select('*'),
      supabase.from('sale_items').select('*'),
      supabase.from('savings').select('*'),
      supabase.from('investments').select('*'),
      supabase.from('investor_funding').select('*'),
      supabase.from('restocks').select('*'),
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
    });
  }, []);

  useEffect(() => {
    void fetchData();
    const refresh = () => { void fetchData(); };
    const channel = supabase.channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'savings' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investments' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investor_funding' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restocks' }, refresh)
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [fetchData]);

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

  const hasFilter = !!dateFrom && !!dateTo;
  const overall = useMemo(
    () => calcMetrics(raw.sales, raw.expenses, raw.products, raw.saleItems, raw.savings, raw.investments, raw.funding, raw.restocks),
    [raw],
  );

  const filtered = useMemo(() => {
    if (!hasFilter) return null;
    const fSales = raw.sales.filter((sale) => inDateRange(sale.sale_date, dateFrom, dateTo));
    const fExpenses = raw.expenses.filter((expense) => inDateRange(expense.expense_date, dateFrom, dateTo));
    const saleDates = new Map(raw.sales.map((sale) => [sale.id, sale.sale_date]));
    const fSaleItems = raw.saleItems.filter((item) => {
      const saleDate = saleDates.get(item.sale_id);
      return saleDate ? inDateRange(saleDate, dateFrom, dateTo) : false;
    });
    const fSavings = raw.savings.filter((saving) => inDateRange(saving.savings_date, dateFrom, dateTo));
    const fInvestments = raw.investments.filter((investment) => inDateRange(investment.investment_date, dateFrom, dateTo));
    const fFunding = raw.funding.filter((funding) => inDateRange(funding.date_received, dateFrom, dateTo));
    const fRestocks = raw.restocks.filter((restock) => inDateRange(restock.restock_date, dateFrom, dateTo));
    return calcMetrics(fSales, fExpenses, raw.products, fSaleItems, fSavings, fInvestments, fFunding, fRestocks);
  }, [raw, dateFrom, dateTo, hasFilter]);

  const chartData = useMemo(() => {
    const start = hasFilter ? new Date(`${dateFrom}T00:00:00`) : new Date(Date.now() - 6 * DAY_MS);
    const end = hasFilter ? new Date(`${dateTo}T00:00:00`) : new Date();
    const dayCount = Math.max(1, Math.min(62, Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1));
    return Array.from({ length: dayCount }, (_, index) => {
      const date = new Date(start.getTime() + index * DAY_MS);
      const dayStr = date.toISOString().slice(0, 10);
      const label = dayCount <= 10
        ? date.toLocaleDateString('en-GB', { weekday: 'short' })
        : date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
      const sales = raw.sales
        .filter((sale) => sale.sale_date.slice(0, 10) === dayStr)
        .reduce((sum, sale) => sum + Number(sale.total), 0);
      return { name: label, sales };
    });
  }, [raw.sales, hasFilter, dateFrom, dateTo]);

  const recentSales = useMemo(() => {
    const source = hasFilter ? raw.sales.filter((sale) => inDateRange(sale.sale_date, dateFrom, dateTo)) : raw.sales;
    return source.slice(0, 5);
  }, [raw.sales, hasFilter, dateFrom, dateTo]);

  const todayMetrics = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    return {
      todaySales: raw.sales.filter((sale) => sale.sale_date >= todayStart).reduce((sum, sale) => sum + Number(sale.total), 0),
      weeklySales: raw.sales.filter((sale) => sale.sale_date >= weekStart).reduce((sum, sale) => sum + Number(sale.total), 0),
      monthlySales: raw.sales.filter((sale) => sale.sale_date >= monthStart).reduce((sum, sale) => sum + Number(sale.total), 0),
    };
  }, [raw.sales]);

  const activeMetrics = filtered ?? overall;
  const filterLabel = hasFilter ? formatDateRange(dateFrom, dateTo) : 'Last 7 days and all-time totals';

  return (
    <AppLayout title="Dashboard">
      <QuickTour open={tourOpen} onOpenChange={setTourOpen} businessName={business?.name} />
      <BusinessOnboardingDialog open={!business} onCompleted={() => { void fetchData(); }} />
      <div className="space-y-5 animate-fade-in">
        <SubscriptionBanner />

        <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Today</p>
              <h2 className="mt-1 text-2xl font-bold">{business?.name ?? 'Your business'} dashboard</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Focus on cash, sales, stock, and the next action.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="grid gap-1">
                <Label htmlFor="dashboard-from" className="text-[10px] uppercase tracking-wider text-muted-foreground">From</Label>
                <Input id="dashboard-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-10 w-[150px]" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="dashboard-to" className="text-[10px] uppercase tracking-wider text-muted-foreground">To</Label>
                <Input id="dashboard-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-10 w-[150px]" />
              </div>
              {hasFilter && (
                <Button variant="ghost" size="sm" onClick={() => { setDateFrom(daysAgoInputValue(6)); setDateTo(todayInputValue()); }}>
                  <X className="mr-1 h-4 w-4" /> Clear
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setTourOpen(true)} className="hidden sm:inline-flex">
                <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Tour
              </Button>
            </div>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-3">
          <DashboardStat
            title="Available cash"
            value={formatCurrency(overall.availableCash)}
            detail="All-time business money"
            icon={Wallet}
            tone={overall.availableCash < 0 ? 'danger' : 'primary'}
            large
          />
          <DashboardStat
            title="Today's sales"
            value={formatCurrency(todayMetrics.todaySales)}
            detail={`${formatCurrency(todayMetrics.weeklySales)} in the last 7 days`}
            icon={ShoppingCart}
          />
          <DashboardStat
            title="Stock left"
            value={String(overall.stockLeft)}
            detail={overall.lowStockCount > 0 ? `${overall.lowStockCount} low stock item${overall.lowStockCount === 1 ? '' : 's'}` : 'Inventory looks fine'}
            icon={overall.lowStockCount > 0 ? AlertTriangle : Package}
            tone={overall.lowStockCount > 0 ? 'warning' : 'neutral'}
          />
        </div>

        <section className="grid gap-3 md:grid-cols-4">
          <DashboardStat
            title={hasFilter ? 'Period sales' : 'This month'}
            value={formatCurrency(hasFilter ? activeMetrics.totalRevenue : todayMetrics.monthlySales)}
            detail={filterLabel}
            icon={DollarSign}
          />
          <DashboardStat
            title="Net profit"
            value={formatCurrency(activeMetrics.netProfit)}
            detail={hasFilter ? 'Selected period' : 'All-time after expenses'}
            icon={activeMetrics.netProfit >= 0 ? TrendingUp : TrendingDown}
            tone={activeMetrics.netProfit >= 0 ? 'primary' : 'danger'}
          />
          <DashboardStat
            title="Outstanding"
            value={formatCurrency(overall.outstandingBalance)}
            detail="Customer balances"
            icon={Users}
            tone={overall.outstandingBalance > 0 ? 'warning' : 'neutral'}
          />
          <DashboardStat
            title="Expenses"
            value={formatCurrency(activeMetrics.totalExpenses)}
            detail={hasFilter ? 'Selected period' : 'All-time spending'}
            icon={TrendingDown}
            tone="neutral"
          />
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.25fr_0.9fr]">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">
                  {hasFilter ? 'Sales trend' : 'Sales this week'}
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{filterLabel}</p>
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
                <ResponsiveContainer width="100%" height={240}>
                  {chartType === 'bar' ? (
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : (
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Line type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="No sales yet"
                  description={hasFilter ? `No sales recorded for ${filterLabel}.` : 'Record your first sale to see a trend here.'}
                  action={<Button asChild><Link to="/sales">Record sale</Link></Button>}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Recent transactions</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Latest sales activity.</p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link to="/sales">View all <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentSales.length > 0 ? (
                <div className="space-y-2">
                  {recentSales.map((sale) => (
                    <div key={sale.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{sale.customer_name || 'Walk-in customer'}</p>
                        <p className="text-xs text-muted-foreground">{new Date(sale.sale_date).toLocaleDateString()}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-right">
                        <StatusBadge status={sale.payment_status} />
                        <span className="text-sm font-semibold">{formatCurrency(Number(sale.total))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No transactions"
                  description={hasFilter ? `No transactions for ${filterLabel}.` : 'Recent sales will show up here.'}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <section className="grid gap-3 md:grid-cols-3">
          <MiniMetric label="Gross profit" value={formatCurrency(activeMetrics.totalProfit)} />
          <MiniMetric label="Savings and investments" value={formatCurrency(activeMetrics.totalSavings + activeMetrics.totalInvestments)} />
          <MiniMetric label="Restock spending" value={formatCurrency(activeMetrics.totalRestockSpending)} />
        </section>
      </div>
    </AppLayout>
  );
}

function DashboardStat({
  title,
  value,
  detail,
  icon: Icon,
  tone = 'primary',
  large = false,
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'primary' | 'warning' | 'danger' | 'neutral';
  large?: boolean;
}) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    danger: 'bg-destructive/10 text-destructive',
    neutral: 'bg-muted text-muted-foreground',
  }[tone];

  return (
    <Card className={cn(large && 'md:col-span-1')}>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className={cn('mt-1 truncate font-bold', large ? 'text-2xl' : 'text-xl')}>{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
        </div>
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', toneClass)}>
          <Icon className="h-5 w-5" />
        </span>
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
