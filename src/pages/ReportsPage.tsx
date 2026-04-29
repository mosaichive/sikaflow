import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { formatCurrency, PAYMENT_METHODS } from '@/lib/constants';
import {
  calculateAvailableBusinessMoney,
  calculateSalesIncome,
  calculateSalesProfit,
  calculateTotalExpenses,
  calculateTotalOtherIncome,
  getPaidAmount,
  isRecognizedSale,
  toNumber,
} from '@/lib/sales-inventory';
import { supabase } from '@/integrations/supabase/client';
import { useBusiness } from '@/context/BusinessContext';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { BarChart3, CalendarRange, Download, FileText, FilterX, PackageSearch, Receipt, TrendingUp, WalletCards } from 'lucide-react';
import { buildReportStatement, downloadReportSlipPdf } from '@/lib/report-slip';
import { loadProductsCompat, logSupabaseError } from '@/lib/workspace';

type RawReportData = {
  sales: any[];
  saleItems: any[];
  expenses: any[];
  savings: any[];
  investments: any[];
  funding: any[];
  restocks: any[];
  otherIncome: any[];
  products: any[];
};

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getRangeFromFilters({
  year,
  monthEnabled,
  month,
  useCustomRange,
  customFrom,
  customTo,
}: {
  year: string;
  monthEnabled: boolean;
  month: string;
  useCustomRange: boolean;
  customFrom: string;
  customTo: string;
}) {
  if (useCustomRange && customFrom && customTo) {
    return { from: customFrom, to: customTo };
  }

  const numericYear = Number(year);
  if (!Number.isFinite(numericYear)) {
    const now = new Date();
    return { from: formatDateInput(new Date(now.getFullYear(), 0, 1)), to: formatDateInput(now) };
  }

  if (monthEnabled) {
    const monthIndex = Math.max(0, Number(month) - 1);
    const start = new Date(numericYear, monthIndex, 1);
    const end = new Date(numericYear, monthIndex + 1, 0);
    return { from: formatDateInput(start), to: formatDateInput(end) };
  }

  return {
    from: `${numericYear}-01-01`,
    to: `${numericYear}-12-31`,
  };
}

function inDateRange(value: string | null | undefined, from: string, to: string) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T23:59:59`).getTime();
  return timestamp >= start && timestamp <= end;
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const offset = (day + 6) % 7;
  next.setDate(next.getDate() - offset);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfWeek(date: Date) {
  const next = startOfWeek(date);
  next.setDate(next.getDate() + 6);
  next.setHours(23, 59, 59, 999);
  return next;
}

function getPaymentMethodLabel(value: string | null | undefined) {
  return PAYMENT_METHODS.find((method) => method.value === value)?.label ?? 'Cash';
}

function getCreditStatus(paymentStatus: string | null | undefined, dueDate: string | null | undefined) {
  const normalized = String(paymentStatus || '').toLowerCase();
  if (normalized === 'paid') return 'Paid';
  if (normalized === 'partial') return 'Partially Paid';
  if (normalized === 'overdue') return 'Overdue';
  if (normalized === 'unpaid') {
    if (dueDate && new Date(dueDate).getTime() < Date.now()) return 'Overdue';
    return 'Unpaid';
  }
  return dueDate && new Date(dueDate).getTime() < Date.now() ? 'Overdue' : 'Unpaid';
}

export default function ReportsPage() {
  const now = useMemo(() => new Date(), []);
  const currentYear = String(now.getFullYear());
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const { business, businessId } = useBusiness();
  const { displayName, user } = useAuth();
  const { toast } = useToast();

  const [year, setYear] = useState(currentYear);
  const [monthEnabled, setMonthEnabled] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customFrom, setCustomFrom] = useState(`${currentYear}-01-01`);
  const [customTo, setCustomTo] = useState(formatDateInput(now));
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [raw, setRaw] = useState<RawReportData>({
    sales: [],
    saleItems: [],
    expenses: [],
    savings: [],
    investments: [],
    funding: [],
    restocks: [],
    otherIncome: [],
    products: [],
  });

  const { from, to } = useMemo(
    () => getRangeFromFilters({ year, monthEnabled, month, useCustomRange, customFrom, customTo }),
    [year, monthEnabled, month, useCustomRange, customFrom, customTo],
  );

  const invalidRange = from > to;

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const [salesRes, itemsRes, expRes, savRes, invRes, funRes, restockRes, otherIncomeRes, productsRes] = await Promise.allSettled([
      supabase.from('sales').select('*').order('sale_date', { ascending: false }),
      supabase.from('sale_items').select('*'),
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('savings').select('*').order('savings_date', { ascending: false }),
      supabase.from('investments').select('*').order('investment_date', { ascending: false }),
      supabase.from('investor_funding').select('*').order('date_received', { ascending: false }),
      supabase.from('restocks').select('*').order('restock_date', { ascending: false }),
      supabase.from('other_income' as any).select('*').order('income_date', { ascending: false }),
      loadProductsCompat(false, businessId),
    ]);

    setRaw({
      sales: salesRes.status === 'fulfilled' ? (salesRes.value.data ?? []) : [],
      saleItems: itemsRes.status === 'fulfilled' ? (itemsRes.value.data ?? []) : [],
      expenses: expRes.status === 'fulfilled' ? (expRes.value.data ?? []) : [],
      savings: savRes.status === 'fulfilled' ? (savRes.value.data ?? []) : [],
      investments: invRes.status === 'fulfilled' ? (invRes.value.data ?? []) : [],
      funding: funRes.status === 'fulfilled' ? (funRes.value.data ?? []) : [],
      restocks: restockRes.status === 'fulfilled' ? (restockRes.value.data ?? []) : [],
      otherIncome: otherIncomeRes.status === 'fulfilled' ? (otherIncomeRes.value.data ?? []) : [],
      products: productsRes.status === 'fulfilled' ? (productsRes.value ?? []) : [],
    });
    if (salesRes.status === 'rejected') logSupabaseError('reports.load.sales', salesRes.reason, { businessId });
    if (itemsRes.status === 'rejected') logSupabaseError('reports.load.saleItems', itemsRes.reason, { businessId });
    if (expRes.status === 'rejected') logSupabaseError('reports.load.expenses', expRes.reason, { businessId });
    if (savRes.status === 'rejected') logSupabaseError('reports.load.savings', savRes.reason, { businessId });
    if (invRes.status === 'rejected') logSupabaseError('reports.load.investments', invRes.reason, { businessId });
    if (funRes.status === 'rejected') logSupabaseError('reports.load.investorFunding', funRes.reason, { businessId });
    if (restockRes.status === 'rejected') logSupabaseError('reports.load.restocks', restockRes.reason, { businessId });
    if (otherIncomeRes.status === 'rejected') logSupabaseError('reports.load.otherIncome', otherIncomeRes.reason, { businessId });
    if (productsRes.status === 'rejected') logSupabaseError('reports.load.products', productsRes.reason, { businessId });
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    const channel = supabase
      .channel('reports-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'other_income' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restocks' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'savings' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investments' }, () => { void fetchReport(); })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchReport]);

  const filtered = useMemo(() => {
    if (invalidRange) {
      return {
        sales: [],
        saleItems: [],
        expenses: [],
        otherIncome: [],
        savings: [],
        investments: [],
        funding: [],
        restocks: [],
      };
    }

    const sales = raw.sales.filter((sale) => inDateRange(sale.sale_date, from, to));
    const saleIds = new Set(sales.map((sale) => sale.id));

    return {
      sales,
      saleItems: raw.saleItems.filter((item) => saleIds.has(item.sale_id)),
      expenses: raw.expenses.filter((expense) => inDateRange(expense.expense_date, from, to)),
      otherIncome: raw.otherIncome.filter((entry) => inDateRange(entry.income_date, from, to)),
      savings: raw.savings.filter((entry) => inDateRange(entry.savings_date, from, to)),
      investments: raw.investments.filter((entry) => inDateRange(entry.investment_date, from, to)),
      funding: raw.funding.filter((entry) => inDateRange(entry.date_received, from, to)),
      restocks: raw.restocks.filter((entry) => inDateRange(entry.restock_date, from, to)),
    };
  }, [from, invalidRange, raw, to]);

  const recognizedSales = useMemo(
    () => filtered.sales.filter((sale) => isRecognizedSale(sale)),
    [filtered.sales],
  );

  const recognizedSaleIds = useMemo(
    () => new Set(recognizedSales.map((sale) => sale.id)),
    [recognizedSales],
  );

  const recognizedSaleItems = useMemo(
    () => filtered.saleItems.filter((item) => recognizedSaleIds.has(item.sale_id)),
    [filtered.saleItems, recognizedSaleIds],
  );

  const availableMoney = useMemo(
    () =>
      calculateAvailableBusinessMoney({
        sales: filtered.sales,
        otherIncome: filtered.otherIncome,
        expenses: filtered.expenses,
        savings: filtered.savings,
        investments: filtered.investments,
      }),
    [filtered],
  );

  const reportStats = useMemo(() => {
    const salesIncome = calculateSalesIncome(filtered.sales);
    const otherIncome = calculateTotalOtherIncome(filtered.otherIncome);
    const expenses = calculateTotalExpenses(filtered.expenses);
    const salesProfit = calculateSalesProfit(filtered.sales, recognizedSaleItems);
    const stockLeft = raw.products.reduce((sum, product) => sum + Math.max(0, toNumber(product.quantity)), 0);
    const lowStockCount = raw.products.filter((product) => Math.max(0, toNumber(product.quantity)) <= Math.max(0, toNumber(product.low_stock_threshold ?? product.reorder_level ?? 0))).length;
    return {
      salesIncome,
      otherIncome,
      totalIncome: salesIncome + otherIncome,
      expenses,
      salesProfit,
      totalProfit: salesProfit + otherIncome - expenses,
      availableBusinessMoney: availableMoney.availableBusinessMoney,
      stockLeft,
      lowStockCount,
    };
  }, [availableMoney.availableBusinessMoney, filtered, raw.products, recognizedSaleItems]);

  const periodSales = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const weekStart = startOfWeek(new Date());
    const weekEnd = endOfWeek(new Date());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

    const sumRange = (start: Date, end: Date) =>
      raw.sales.reduce((sum, sale) => {
        const timestamp = new Date(sale.sale_date).getTime();
        if (timestamp < start.getTime() || timestamp > end.getTime() || !isRecognizedSale(sale)) return sum;
        return sum + getPaidAmount(sale);
      }, 0);

    return {
      today: sumRange(todayStart, todayEnd),
      week: sumRange(weekStart, weekEnd),
      month: sumRange(monthStart, monthEnd),
      year: sumRange(yearStart, yearEnd),
    };
  }, [now, raw.sales]);

  const productPerformance = useMemo(() => {
    const grouped = new Map<string, { name: string; quantity: number; revenue: number; profit: number }>();
    recognizedSaleItems.forEach((item) => {
      const key = item.product_id || item.product_name || 'unknown';
      const quantity = Number(item.quantity ?? 0);
      const unitPrice = Number(item.unit_price ?? 0);
      const costPrice = Number(item.cost_price ?? 0);
      const existing = grouped.get(key) || { name: item.product_name || 'Unknown product', quantity: 0, revenue: 0, profit: 0 };
      existing.quantity += quantity;
      existing.revenue += quantity * unitPrice;
      existing.profit += quantity * (unitPrice - costPrice);
      grouped.set(key, existing);
    });
    return Array.from(grouped.values()).sort((left, right) => right.revenue - left.revenue);
  }, [recognizedSaleItems]);

  const paymentBreakdown = useMemo(() => {
    const grouped = new Map<string, { method: string; moneyIn: number; moneyOut: number; txCount: number }>();
    const ensure = (method: string) => {
      const existing = grouped.get(method);
      if (existing) return existing;
      const next = { method, moneyIn: 0, moneyOut: 0, txCount: 0 };
      grouped.set(method, next);
      return next;
    };

    recognizedSales.forEach((sale) => {
      const item = ensure(sale.payment_method || 'cash');
      item.moneyIn += getPaidAmount(sale);
      item.txCount += 1;
    });

    filtered.otherIncome.forEach((entry) => {
      const item = ensure(entry.payment_method || 'cash');
      item.moneyIn += Number(entry.amount ?? 0);
      item.txCount += 1;
    });

    filtered.expenses.forEach((expense) => {
      const item = ensure(expense.payment_method || 'cash');
      item.moneyOut += Number(expense.amount ?? 0);
      item.txCount += 1;
    });

    return Array.from(grouped.values()).sort((left, right) => (right.moneyIn - right.moneyOut) - (left.moneyIn - left.moneyOut));
  }, [filtered.expenses, filtered.otherIncome, recognizedSales]);

  const creditReport = useMemo(() => {
    const grouped = new Map<string, { customerName: string; amountOwed: number; amountPaid: number; balance: number; lastDueDate: string | null; status: string }>();
    filtered.sales.forEach((sale) => {
      const customerName = sale.customer_name || 'Walk-in';
      const amountPaid = Number(sale.amount_paid ?? 0);
      const total = Number(sale.total ?? 0);
      const balance = Number(sale.balance ?? Math.max(0, total - amountPaid));
      if (customerName === 'Walk-in' || balance <= 0) return;
      const existing = grouped.get(customerName) || {
        customerName,
        amountOwed: 0,
        amountPaid: 0,
        balance: 0,
        lastDueDate: null,
        status: 'Unpaid',
      };
      existing.amountOwed += total;
      existing.amountPaid += amountPaid;
      existing.balance += balance;
      existing.lastDueDate = sale.due_date || existing.lastDueDate;
      existing.status = getCreditStatus(sale.payment_status, sale.due_date);
      grouped.set(customerName, existing);
    });
    return Array.from(grouped.values()).sort((left, right) => right.balance - left.balance);
  }, [filtered.sales]);

  const statement = useMemo(
    () =>
      buildReportStatement({
        sales: raw.sales,
        expenses: raw.expenses,
        otherIncome: raw.otherIncome,
        savings: raw.savings,
        investments: raw.investments,
        fundings: raw.funding,
        restocks: raw.restocks,
        from,
        to,
      }),
    [from, raw, to],
  );

  const yearOptions = useMemo(() => {
    const base = Number(currentYear);
    return Array.from({ length: 6 }, (_, index) => String(base - 4 + index));
  }, [currentYear]);

  const resetToYearOnly = () => {
    setUseCustomRange(false);
    setMonthEnabled(false);
    setMonth(currentMonth);
    setYear(currentYear);
  };

  const handleDownloadSlip = async () => {
    if (invalidRange) {
      toast({ title: 'Fix the date range', description: 'The start date must come before the end date.', variant: 'destructive' });
      return;
    }
    if (statement.rows.length === 0) {
      toast({ title: 'Nothing to export', description: 'There are no transactions in this date range yet.', variant: 'destructive' });
      return;
    }

    setPdfLoading(true);
    try {
      await downloadReportSlipPdf({
        businessName: business?.name || 'SikaFlow Business',
        generatedFor: displayName || user?.email || 'SikaFlow User',
        dateFrom: from,
        dateTo: to,
        rows: statement.rows,
        openingBalance: statement.openingBalance,
        closingBalance: statement.closingBalance,
        totalMoneyIn: statement.totalMoneyIn,
        totalMoneyOut: statement.totalMoneyOut,
        summary: statement.summary,
      });
    } catch (error: any) {
      toast({
        title: 'Could not generate statement',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <AppLayout title="Reports">
      <div className="space-y-6">
        <section className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/75 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Reports</p>
            <h1 className="text-2xl font-semibold tracking-tight">Sales, stock, and cash reports</h1>
            <p className="text-sm text-muted-foreground">
              Review sales, stock performance, customer credit, other income, and expenses with a year-first filter.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Year</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {yearOptions.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {monthEnabled ? (
              <div className="grid gap-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Month</Label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, index) => {
                      const value = String(index + 1).padStart(2, '0');
                      const label = new Date(2026, index, 1).toLocaleString('en-GH', { month: 'long' });
                      return <SelectItem key={value} value={value}>{label}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {!useCustomRange ? (
              <Button type="button" variant="outline" onClick={() => setMonthEnabled((value) => !value)}>
                {monthEnabled ? 'Year Only' : 'Add Month'}
              </Button>
            ) : null}

            <Button type="button" variant={useCustomRange ? 'secondary' : 'outline'} onClick={() => setUseCustomRange((value) => !value)}>
              <CalendarRange className="mr-2 h-4 w-4" />
              {useCustomRange ? 'Using Custom Range' : 'Custom Range'}
            </Button>

            <Button type="button" variant="ghost" onClick={resetToYearOnly}>
              <FilterX className="mr-2 h-4 w-4" /> Reset
            </Button>
          </div>
        </section>

        {useCustomRange ? (
          <div className="grid gap-4 rounded-3xl border border-border/70 bg-card/70 p-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
            </div>
          </div>
        ) : null}

        {invalidRange ? <p className="text-sm text-destructive">The start date must be before the end date.</p> : null}

        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <ReportMetric label="Available Business Money" value={formatCurrency(reportStats.availableBusinessMoney)} />
          <ReportMetric label="Paid Sales Income" value={formatCurrency(reportStats.salesIncome)} />
          <ReportMetric label="Other Income" value={formatCurrency(reportStats.otherIncome)} />
          <ReportMetric label="Total Profit" value={formatCurrency(reportStats.totalProfit)} />
          <ReportMetric label="Stock Left" value={`${reportStats.stockLeft} item(s)`} />
          <ReportMetric label="Low Stock Alerts" value={`${reportStats.lowStockCount}`} />
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <ReportMetric label="Today Sales" value={formatCurrency(periodSales.today)} />
          <ReportMetric label="This Week Sales" value={formatCurrency(periodSales.week)} />
          <ReportMetric label="This Month Sales" value={formatCurrency(periodSales.month)} />
          <ReportMetric label="This Year Sales" value={formatCurrency(periodSales.year)} />
        </div>

        <Card className="overflow-hidden border-primary/25">
          <CardHeader className="flex flex-col gap-4 border-b border-border/60 bg-muted/20 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-primary" />
                Financial Statement PDF
              </CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                Download a clean transaction statement covering sales, other income, expenses, savings, investments, investor funds, and restocks.
              </p>
            </div>
            <Button onClick={() => void handleDownloadSlip()} disabled={invalidRange || statement.rows.length === 0 || pdfLoading}>
              <Download className="mr-2 h-4 w-4" />
              {pdfLoading ? 'Generating PDF...' : 'Download Statement'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-5 p-4 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ReportMetric label="Opening Balance" value={formatCurrency(statement.openingBalance)} />
              <ReportMetric label="Money In" value={formatCurrency(statement.totalMoneyIn)} tone="text-emerald-600 dark:text-emerald-400" />
              <ReportMetric label="Money Out" value={formatCurrency(statement.totalMoneyOut)} tone="text-destructive" />
              <ReportMetric label="Closing Balance" value={formatCurrency(statement.closingBalance)} />
            </div>

            {statement.rows.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-7 w-7 text-muted-foreground" />}
                title="No transactions in this range"
                description="Change the report filters to preview a statement before downloading."
              />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border">
                <div className="max-h-[420px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Money In</TableHead>
                        <TableHead className="text-right">Money Out</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statement.rows.map((row) => (
                        <TableRow key={`${row.reference}-${row.date}`}>
                          <TableCell>{new Date(row.date).toLocaleDateString('en-GH')}</TableCell>
                          <TableCell className="font-medium">{row.reference}</TableCell>
                          <TableCell>{row.type}</TableCell>
                          <TableCell className="max-w-[280px] whitespace-normal text-muted-foreground">{row.description}</TableCell>
                          <TableCell className="text-right text-emerald-600 dark:text-emerald-400">{row.moneyIn > 0 ? formatCurrency(row.moneyIn) : '—'}</TableCell>
                          <TableCell className="text-right text-destructive">{row.moneyOut > 0 ? formatCurrency(row.moneyOut) : '—'}</TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(row.runningBalance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-primary" />
                Product Performance Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              {productPerformance.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Units Sold</TableHead>
                      <TableHead className="text-right">Sales Income</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productPerformance.slice(0, 12).map((row) => (
                      <TableRow key={row.name}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-right">{row.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.profit)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  icon={<TrendingUp className="h-7 w-7 text-muted-foreground" />}
                  title="No sales performance yet"
                  description="Paid sales in the selected range will populate this report."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <WalletCards className="h-4 w-4 text-primary" />
                Payment Method Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              {paymentBreakdown.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Money In</TableHead>
                      <TableHead className="text-right">Money Out</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentBreakdown.map((row) => (
                      <TableRow key={row.method}>
                        <TableCell>{getPaymentMethodLabel(row.method)}</TableCell>
                        <TableCell className="text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(row.moneyIn)}</TableCell>
                        <TableCell className="text-right text-destructive">{formatCurrency(row.moneyOut)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  icon={<WalletCards className="h-7 w-7 text-muted-foreground" />}
                  title="No payment activity yet"
                  description="Payment methods will appear once transactions are recorded."
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PackageSearch className="h-4 w-4 text-primary" />
                Inventory Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              {raw.products.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Stock Left</TableHead>
                      <TableHead className="text-right">Cost Value</TableHead>
                      <TableHead className="text-right">Selling Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {raw.products.slice(0, 12).map((product) => {
                      const quantity = Math.max(0, toNumber(product.quantity));
                      const threshold = Math.max(0, toNumber(product.low_stock_threshold ?? product.reorder_level ?? 0));
                      return (
                        <TableRow key={product.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <span>{product.name}</span>
                              {quantity <= threshold ? <Badge variant="destructive">Low Stock</Badge> : null}
                            </div>
                          </TableCell>
                          <TableCell>{product.category || 'Uncategorized'}</TableCell>
                          <TableCell className="text-right">{quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(quantity * toNumber(product.cost_price))}</TableCell>
                          <TableCell className="text-right">{formatCurrency(quantity * toNumber(product.selling_price))}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  icon={<PackageSearch className="h-7 w-7 text-muted-foreground" />}
                  title="No inventory yet"
                  description="Add products and opening stock to see an inventory report here."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="h-4 w-4 text-primary" />
                Customer Credit Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              {creditReport.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {creditReport.map((row) => (
                      <TableRow key={row.customerName}>
                        <TableCell className="font-medium">{row.customerName}</TableCell>
                        <TableCell className="text-right text-destructive">{formatCurrency(row.balance)}</TableCell>
                        <TableCell>
                          <Badge variant={row.status === 'Paid' ? 'secondary' : 'destructive'}>{row.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  icon={<Receipt className="h-7 w-7 text-muted-foreground" />}
                  title="No credit balances"
                  description="Customers with unpaid or partial balances will show here."
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Other Income Report</CardTitle>
            </CardHeader>
            <CardContent>
              {filtered.otherIncome.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.otherIncome.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{new Date(entry.income_date).toLocaleDateString('en-GH')}</TableCell>
                        <TableCell>{entry.category}</TableCell>
                        <TableCell className="max-w-[240px] whitespace-normal text-muted-foreground">{entry.description || '—'}</TableCell>
                        <TableCell className="text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(Number(entry.amount ?? 0))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  icon={<TrendingUp className="h-7 w-7 text-muted-foreground" />}
                  title="No other income in range"
                  description="Service income, delivery fees, commissions, and miscellaneous income will show here."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Expense Report</CardTitle>
            </CardHeader>
            <CardContent>
              {filtered.expenses.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.expenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>{new Date(expense.expense_date).toLocaleDateString('en-GH')}</TableCell>
                        <TableCell>{expense.category}</TableCell>
                        <TableCell>{getPaymentMethodLabel(expense.payment_method)}</TableCell>
                        <TableCell className="text-right text-destructive">{formatCurrency(Number(expense.amount ?? 0))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  icon={<Receipt className="h-7 w-7 text-muted-foreground" />}
                  title="No expenses in range"
                  description="Expenses recorded in the selected period will show here."
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function ReportMetric({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-xl font-semibold ${tone}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
