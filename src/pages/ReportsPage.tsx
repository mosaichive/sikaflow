import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { formatCurrency, OTHER_INCOME_CATEGORIES, PAYMENT_METHODS } from '@/lib/constants';
import { calculateAvailableBusinessMoney } from '@/lib/business-money';
import { supabase } from '@/integrations/supabase/client';
import { useBusiness } from '@/context/BusinessContext';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  BarChart3,
  CalendarRange,
  Download,
  FileText,
  HandCoins,
  Link2,
  LineChart as LineChartIcon,
  PackagePlus,
  PiggyBank,
  TrendingUp,
  Trash2,
} from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  buildReportStatement,
  downloadReportSlipPdf,
  getPresetRange,
  type ReportRangePreset,
} from '@/lib/report-slip';

type RawReportData = {
  sales: any[];
  saleItems: any[];
  expenses: any[];
  savings: any[];
  investments: any[];
  funding: any[];
  restocks: any[];
  otherIncome: any[];
};

type PeriodStats = {
  revenue: number;
  salesIncome: number;
  otherIncome: number;
  totalIncome: number;
  cost: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  savings: number;
  investments: number;
  funding: number;
  restockSpending: number;
  availableCash: number;
};

const PRESET_OPTIONS: Array<{ value: Exclude<ReportRangePreset, 'custom'>; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
];

const PAYMENT_METHOD_LABELS = Object.fromEntries(PAYMENT_METHODS.map((method) => [method.value, method.label])) as Record<string, string>;

function inDateRange(value: string | null | undefined, from: string, to: string) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T23:59:59`).getTime();
  return timestamp >= start && timestamp <= end;
}

function computePeriodStats({
  sales,
  saleItems,
  expenses,
  otherIncome,
  savings,
  investments,
  funding,
  restocks,
}: Omit<RawReportData, 'saleItems'> & { saleItems: any[] }): PeriodStats {
  const revenue = sales.reduce((sum, sale) => sum + Number(sale.total ?? 0), 0);
  const moneySummary = calculateAvailableBusinessMoney({
    sales,
    otherIncome,
    expenses,
    savings,
    investments,
  });
  const cost = saleItems.reduce((sum, item) => sum + Number(item.cost_price ?? 0) * Number(item.quantity ?? 0), 0);
  const grossProfit = revenue - cost;
  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
  const totalSavings = savings.reduce((sum, record) => sum + Number(record.amount ?? 0), 0);
  const totalInvestments = investments.reduce((sum, record) => sum + Number(record.amount ?? 0), 0);
  const totalFunding = funding.reduce((sum, record) => sum + Number(record.amount ?? 0), 0);
  const totalRestocks = restocks.reduce((sum, record) => sum + Number(record.total_cost ?? 0), 0);

  return {
    revenue,
    salesIncome: moneySummary.salesIncome,
    otherIncome: moneySummary.otherIncome,
    totalIncome: moneySummary.totalIncome,
    cost,
    grossProfit,
    expenses: totalExpenses,
    netProfit: grossProfit + moneySummary.otherIncome - totalExpenses,
    savings: totalSavings,
    investments: totalInvestments,
    funding: totalFunding,
    restockSpending: totalRestocks,
    availableCash: moneySummary.availableBusinessMoney,
  };
}

export default function ReportsPage() {
  const defaultRange = getPresetRange('month');
  const { business, businessId } = useBusiness();
  const { displayName, user, isAdmin, isManager } = useAuth();
  const { toast } = useToast();
  const [preset, setPreset] = useState<ReportRangePreset>('month');
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [raw, setRaw] = useState<RawReportData>({
    sales: [],
    saleItems: [],
    expenses: [],
    savings: [],
    investments: [],
    funding: [],
    restocks: [],
    otherIncome: [],
  });
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [salesChartType, setSalesChartType] = useState<'bar' | 'line'>('bar');
  const [incomeSaving, setIncomeSaving] = useState(false);
  const [openingAttachment, setOpeningAttachment] = useState<string | null>(null);
  const [deletingIncomeId, setDeletingIncomeId] = useState<string | null>(null);
  const [incomeForm, setIncomeForm] = useState({
    category: OTHER_INCOME_CATEGORIES[0],
    amount: '',
    income_date: new Date().toISOString().slice(0, 10),
    payment_method: PAYMENT_METHODS[0].value,
    description: '',
  });
  const [incomeAttachment, setIncomeAttachment] = useState<File | null>(null);
  const [incomeAttachmentKey, setIncomeAttachmentKey] = useState(0);
  const canManageOtherIncome = isAdmin || isManager;

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const [salesRes, itemsRes, expRes, savRes, invRes, funRes, restockRes, otherIncomeRes] = await Promise.all([
      supabase.from('sales').select('*').order('sale_date', { ascending: false }),
      supabase.from('sale_items').select('*'),
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('savings').select('*').order('savings_date', { ascending: false }),
      supabase.from('investments').select('*').order('investment_date', { ascending: false }),
      supabase.from('investor_funding').select('*').order('date_received', { ascending: false }),
      supabase.from('restocks').select('*').order('restock_date', { ascending: false }),
      supabase.from('other_income' as any).select('*').order('income_date', { ascending: false }),
    ]);

    setRaw({
      sales: salesRes.data ?? [],
      saleItems: itemsRes.data ?? [],
      expenses: expRes.data ?? [],
      savings: savRes.data ?? [],
      investments: invRes.data ?? [],
      funding: funRes.data ?? [],
      restocks: restockRes.data ?? [],
      otherIncome: otherIncomeRes.data ?? [],
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    const channel = supabase
      .channel('reports-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'savings' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investments' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investor_funding' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restocks' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'other_income' }, () => { void fetchReport(); })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchReport]);

  const invalidRange = dateFrom > dateTo;

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

    const sales = raw.sales.filter((sale) => inDateRange(sale.sale_date, dateFrom, dateTo));
    const saleIds = new Set(sales.map((sale) => sale.id));

    return {
      sales,
      saleItems: raw.saleItems.filter((item) => saleIds.has(item.sale_id)),
      expenses: raw.expenses.filter((expense) => inDateRange(expense.expense_date, dateFrom, dateTo)),
      otherIncome: raw.otherIncome.filter((entry) => inDateRange(entry.income_date, dateFrom, dateTo)),
      savings: raw.savings.filter((saving) => inDateRange(saving.savings_date, dateFrom, dateTo)),
      investments: raw.investments.filter((investment) => inDateRange(investment.investment_date, dateFrom, dateTo)),
      funding: raw.funding.filter((entry) => inDateRange(entry.date_received, dateFrom, dateTo)),
      restocks: raw.restocks.filter((restock) => inDateRange(restock.restock_date, dateFrom, dateTo)),
    };
  }, [dateFrom, dateTo, invalidRange, raw]);

  const stats = useMemo(() => computePeriodStats(filtered), [filtered]);

  const salesChartData = useMemo(() => {
    const grouped: Record<string, number> = {};

    filtered.saleItems.forEach((item) => {
      const name = item.product_name || 'Other';
      grouped[name] = (grouped[name] || 0) + Number(item.line_total ?? 0);
    });

    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 10);
  }, [filtered.saleItems]);

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
        from: dateFrom,
        to: dateTo,
      }),
    [dateFrom, dateTo, raw],
  );

  const applyPreset = (nextPreset: Exclude<ReportRangePreset, 'custom'>) => {
    const range = getPresetRange(nextPreset);
    setPreset(nextPreset);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const handleDateFromChange = (value: string) => {
    setPreset('custom');
    setDateFrom(value);
  };

  const handleDateToChange = (value: string) => {
    setPreset('custom');
    setDateTo(value);
  };

  const handleDownloadSlip = async () => {
    if (invalidRange) {
      toast({
        title: 'Fix the date range',
        description: 'The start date needs to be before the end date.',
        variant: 'destructive',
      });
      return;
    }
    if (statement.rows.length === 0) {
      toast({
        title: 'Nothing to export',
        description: 'There are no transactions in this date range yet.',
        variant: 'destructive',
      });
      return;
    }

    setPdfLoading(true);
    try {
      await downloadReportSlipPdf({
        businessName: business?.name || 'SikaFlow Business',
        generatedFor: displayName || user?.email || 'SikaFlow User',
        dateFrom,
        dateTo,
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

  const handleIncomeAttachmentChange = (file: File | null) => {
    if (!file) {
      setIncomeAttachment(null);
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: 'Unsupported attachment',
        description: 'Upload a JPG, PNG, WEBP, or PDF receipt.',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Attachment too large',
        description: 'Keep attachments under 5MB.',
        variant: 'destructive',
      });
      return;
    }

    setIncomeAttachment(file);
  };

  const uploadIncomeAttachment = async () => {
    if (!incomeAttachment || !businessId || !user) return null;
    const sanitizedName = incomeAttachment.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${businessId}/${user.id}/${Date.now()}-${sanitizedName}`;
    const { error } = await supabase.storage
      .from('other-income-receipts')
      .upload(path, incomeAttachment, { upsert: true });

    if (error) throw error;
    return { path, name: incomeAttachment.name };
  };

  const resetIncomeForm = () => {
    setIncomeForm({
      category: OTHER_INCOME_CATEGORIES[0],
      amount: '',
      income_date: new Date().toISOString().slice(0, 10),
      payment_method: PAYMENT_METHODS[0].value,
      description: '',
    });
    setIncomeAttachment(null);
    setIncomeAttachmentKey((value) => value + 1);
  };

  const handleSaveOtherIncome = async () => {
    if (!canManageOtherIncome || !businessId || !user) return;

    const amount = Number(incomeForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Enter an amount greater than zero.',
        variant: 'destructive',
      });
      return;
    }

    if (incomeForm.description.trim().length > 240) {
      toast({
        title: 'Description too long',
        description: 'Keep the description under 240 characters.',
        variant: 'destructive',
      });
      return;
    }

    setIncomeSaving(true);
    try {
      const attachment = await uploadIncomeAttachment();
      const { error } = await supabase.from('other_income' as any).insert({
        business_id: businessId,
        category: incomeForm.category,
        amount,
        income_date: incomeForm.income_date,
        payment_method: incomeForm.payment_method,
        description: incomeForm.description.trim(),
        attachment_path: attachment?.path ?? null,
        attachment_name: attachment?.name ?? null,
        recorded_by: user.id,
        recorded_by_name: displayName || user.email || 'Team member',
      });

      if (error) throw error;

      resetIncomeForm();
      toast({
        title: 'Other income saved',
        description: 'The entry now counts toward income and available business money.',
      });
    } catch (error: any) {
      toast({
        title: 'Could not save other income',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIncomeSaving(false);
    }
  };

  const handleOpenAttachment = async (entry: any) => {
    if (!entry?.attachment_path) return;
    setOpeningAttachment(entry.id);
    try {
      const { data, error } = await supabase.storage
        .from('other-income-receipts')
        .createSignedUrl(entry.attachment_path, 60);

      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      toast({
        title: 'Could not open attachment',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setOpeningAttachment(null);
    }
  };

  const handleDeleteOtherIncome = async (entry: any) => {
    if (!canManageOtherIncome) return;
    const confirmed = window.confirm('Delete this other income record?');
    if (!confirmed) return;

    setDeletingIncomeId(entry.id);
    try {
      if (entry.attachment_path) {
        await supabase.storage.from('other-income-receipts').remove([entry.attachment_path]);
      }

      const { error } = await supabase.from('other_income' as any).delete().eq('id', entry.id);
      if (error) throw error;

      toast({
        title: 'Other income deleted',
        description: 'The entry has been removed.',
      });
    } catch (error: any) {
      toast({
        title: 'Could not delete entry',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeletingIncomeId(null);
    }
  };

  return (
    <AppLayout title="Reports">
      <div className="space-y-6 animate-fade-in">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Reports</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">Financial slip and transaction summary</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Review the selected date range, preview combined activity, and export a Ghana-friendly report slip.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
              <div className="grid gap-1">
                <Label htmlFor="reports-from" className="text-[10px] uppercase tracking-wider text-muted-foreground">From</Label>
                <Input id="reports-from" type="date" value={dateFrom} onChange={(event) => handleDateFromChange(event.target.value)} className="w-full lg:w-40" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="reports-to" className="text-[10px] uppercase tracking-wider text-muted-foreground">To</Label>
                <Input id="reports-to" type="date" value={dateTo} onChange={(event) => handleDateToChange(event.target.value)} className="w-full lg:w-40" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESET_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={preset === option.value ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => applyPreset(option.value)}
              >
                {option.label}
              </Button>
            ))}
            <Button type="button" variant={preset === 'custom' ? 'secondary' : 'outline'} size="sm" disabled>
              Custom Range
            </Button>
          </div>

          {invalidRange ? (
            <p className="text-sm text-destructive">The start date must be before the end date.</p>
          ) : null}
        </div>

        <Card className="overflow-hidden border-primary/25">
          <CardHeader className="flex flex-col gap-4 border-b border-border/60 bg-muted/20 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarRange className="h-4 w-4 text-primary" />
                Report Slip PDF
              </CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">
                Combined statement for sales, other income, expenses, savings, investments, investor funds, and stock restocks.
              </p>
            </div>
            <Button onClick={() => void handleDownloadSlip()} disabled={invalidRange || statement.rows.length === 0 || pdfLoading}>
              <Download className="mr-1.5 h-4 w-4" /> {pdfLoading ? 'Generating PDF...' : 'Download Slip PDF'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-5 p-4 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryMetric label="Opening Balance" value={statement.openingBalance} />
              <SummaryMetric label="Money In" value={statement.totalMoneyIn} tone="text-emerald-600 dark:text-emerald-400" />
              <SummaryMetric label="Money Out" value={statement.totalMoneyOut} tone="text-destructive" />
              <SummaryMetric label="Closing Balance" value={statement.closingBalance} />
            </div>

            {statement.rows.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-7 w-7 text-muted-foreground" />}
                title="No transactions in this range"
                description="Pick another date range to preview activity before downloading the statement slip."
              />
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold">Statement Preview</p>
                    <p className="text-xs text-muted-foreground">{statement.rows.length} transactions ordered chronologically</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Range: {new Date(`${dateFrom}T00:00:00`).toLocaleDateString('en-GH')} to {new Date(`${dateTo}T00:00:00`).toLocaleDateString('en-GH')}
                  </p>
                </div>

                <div className="overflow-hidden rounded-xl border border-border">
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
                            <TableCell className="text-xs">{new Date(row.date).toLocaleDateString('en-GH')}</TableCell>
                            <TableCell className="font-medium">{row.reference}</TableCell>
                            <TableCell>{row.type}</TableCell>
                            <TableCell className="max-w-[280px] whitespace-normal text-muted-foreground">{row.description}</TableCell>
                            <TableCell className="text-right text-emerald-600 dark:text-emerald-400">
                              {row.moneyIn > 0 ? formatCurrency(row.moneyIn) : '—'}
                            </TableCell>
                            <TableCell className="text-right text-destructive">
                              {row.moneyOut > 0 ? formatCurrency(row.moneyOut) : '—'}
                            </TableCell>
                            <TableCell className="text-right font-semibold">{formatCurrency(row.runningBalance)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Financial Summary (Selected Range)</p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
            {[
              { label: 'Sales Income', value: stats.salesIncome, sub: 'Paid and completed sales only' },
              { label: 'Other Income', value: stats.otherIncome, sub: 'Service, delivery, commission, and more' },
              { label: 'Total Income', value: stats.totalIncome, sub: 'Sales income + other income' },
              { label: 'Investor Funding', value: stats.funding, sub: 'External inflow' },
              { label: 'Expenses', value: stats.expenses, sub: 'Money out' },
              { label: 'Savings', value: stats.savings, sub: 'Cash moved to savings' },
              { label: 'Investments', value: stats.investments, sub: 'Cash moved to investments' },
              { label: 'Restock Spending', value: stats.restockSpending, sub: 'Inventory purchases' },
            ].map((item) => (
              <Card key={item.label}>
                <CardContent className="p-4 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-lg font-bold">{formatCurrency(item.value)}</p>
                  <p className="text-[9px] text-muted-foreground">{item.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Gross Profit</p>
              <p className={`mt-1 text-lg font-bold ${stats.grossProfit < 0 ? 'text-destructive' : ''}`}>{formatCurrency(stats.grossProfit)}</p>
              <p className="text-[9px] text-muted-foreground">Revenue minus cost of goods sold</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Net Profit</p>
              <p className={`mt-1 text-lg font-bold ${stats.netProfit < 0 ? 'text-destructive' : ''}`}>{formatCurrency(stats.netProfit)}</p>
              <p className="text-[9px] text-muted-foreground">Sales profit + other income minus expenses</p>
            </CardContent>
          </Card>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Available Business Money</p>
              <p className={`mt-1 text-lg font-bold ${stats.availableCash < 0 ? 'text-destructive' : 'text-primary'}`}>{formatCurrency(stats.availableCash)}</p>
              <p className="text-[9px] text-muted-foreground">Total income minus expenses</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="sales">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="other-income">Other Income</TabsTrigger>
            <TabsTrigger value="restocks">Restocks</TabsTrigger>
            <TabsTrigger value="savings">Savings</TabsTrigger>
            <TabsTrigger value="investments">Investments</TabsTrigger>
            <TabsTrigger value="funding">Investor Funding</TabsTrigger>
          </TabsList>

          <TabsContent value="sales">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <CardTitle className="text-base">Sales by Product</CardTitle>
                <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1">
                  <Button
                    type="button"
                    variant={salesChartType === 'bar' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 gap-1.5 px-2"
                    onClick={() => setSalesChartType('bar')}
                  >
                    <BarChart3 className="h-3.5 w-3.5" /> Bar
                  </Button>
                  <Button
                    type="button"
                    variant={salesChartType === 'line' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 gap-1.5 px-2"
                    onClick={() => setSalesChartType('line')}
                  >
                    <LineChartIcon className="h-3.5 w-3.5" /> Line
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {salesChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    {salesChartType === 'bar' ? (
                      <BarChart data={salesChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    ) : (
                      <LineChart data={salesChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                ) : (
                  <EmptyState
                    icon={<BarChart3 className="h-7 w-7 text-muted-foreground" />}
                    title="No report data"
                    description="Reports will populate once you have sales in the selected date range."
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="other-income" className="space-y-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Other Income</p>
                <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(stats.otherIncome)}</p>
                <p className="text-[9px] text-muted-foreground">Extra business income that is not tied to product sales</p>
              </CardContent>
            </Card>

            {canManageOtherIncome ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Add Other Income</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Use this for service income, delivery fees, commission, discount recovery, or other business income.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <div className="space-y-2">
                      <Label htmlFor="other-income-category">Category</Label>
                      <Select value={incomeForm.category} onValueChange={(value) => setIncomeForm((current) => ({ ...current, category: value }))}>
                        <SelectTrigger id="other-income-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {OTHER_INCOME_CATEGORIES.map((category) => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="other-income-amount">Amount</Label>
                      <Input
                        id="other-income-amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={incomeForm.amount}
                        onChange={(event) => setIncomeForm((current) => ({ ...current, amount: event.target.value }))}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="other-income-date">Date</Label>
                      <Input
                        id="other-income-date"
                        type="date"
                        value={incomeForm.income_date}
                        onChange={(event) => setIncomeForm((current) => ({ ...current, income_date: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="other-income-method">Payment Method</Label>
                      <Select value={incomeForm.payment_method} onValueChange={(value) => setIncomeForm((current) => ({ ...current, payment_method: value }))}>
                        <SelectTrigger id="other-income-method">
                          <SelectValue placeholder="Select payment method" />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((method) => (
                            <SelectItem key={method.value} value={method.value}>
                              {method.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="other-income-attachment">Attachment / Receipt</Label>
                      <Input
                        key={incomeAttachmentKey}
                        id="other-income-attachment"
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,.pdf"
                        onChange={(event) => handleIncomeAttachmentChange(event.target.files?.[0] ?? null)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="other-income-description">Description</Label>
                    <Textarea
                      id="other-income-description"
                      value={incomeForm.description}
                      onChange={(event) => setIncomeForm((current) => ({ ...current, description: event.target.value }))}
                      placeholder="Add context for this income entry"
                      rows={3}
                    />
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      {incomeAttachment ? `Attachment ready: ${incomeAttachment.name}` : 'Optional: attach a receipt or proof of payment.'}
                    </p>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={resetIncomeForm} disabled={incomeSaving}>
                        Clear
                      </Button>
                      <Button type="button" onClick={() => void handleSaveOtherIncome()} disabled={incomeSaving}>
                        {incomeSaving ? 'Saving...' : 'Save Other Income'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {filtered.otherIncome.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Other Income Entries</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Payment Method</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Attachment</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        {canManageOtherIncome ? <TableHead className="text-right">Actions</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.otherIncome.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="text-xs">{new Date(`${entry.income_date}T00:00:00`).toLocaleDateString('en-GH')}</TableCell>
                          <TableCell className="font-medium">{entry.category}</TableCell>
                          <TableCell>{PAYMENT_METHOD_LABELS[entry.payment_method] || entry.payment_method || '—'}</TableCell>
                          <TableCell className="max-w-[280px] whitespace-normal text-muted-foreground">
                            {entry.description || '—'}
                          </TableCell>
                          <TableCell>
                            {entry.attachment_path ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 px-2"
                                onClick={() => void handleOpenAttachment(entry)}
                                disabled={openingAttachment === entry.id}
                              >
                                <Link2 className="h-3.5 w-3.5" />
                                {openingAttachment === entry.id ? 'Opening...' : entry.attachment_name || 'Open'}
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(Number(entry.amount ?? 0))}
                          </TableCell>
                          {canManageOtherIncome ? (
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-destructive"
                                onClick={() => void handleDeleteOtherIncome(entry)}
                                disabled={deletingIncomeId === entry.id}
                              >
                                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                {deletingIncomeId === entry.id ? 'Deleting...' : 'Delete'}
                              </Button>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : (
              <EmptyState
                icon={<HandCoins className="h-7 w-7 text-muted-foreground" />}
                title="No other income in this period"
                description="Record delivery fees, service income, commission, or other non-sales income here."
              />
            )}
          </TabsContent>

          <TabsContent value="restocks" className="space-y-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Restock Spending</p>
                <p className="mt-1 text-lg font-bold">{formatCurrency(stats.restockSpending)}</p>
                <p className="text-[9px] text-muted-foreground">Inventory purchases in the selected date range</p>
              </CardContent>
            </Card>
            {filtered.restocks.length > 0 ? (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Cost/Unit</TableHead>
                        <TableHead>Total Cost</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Supplier</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.restocks.map((restock) => (
                        <TableRow key={restock.id}>
                          <TableCell className="text-xs">{new Date(restock.restock_date).toLocaleDateString('en-GH')}</TableCell>
                          <TableCell className="font-medium">{restock.product_name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{restock.sku}</TableCell>
                          <TableCell className="font-semibold">{restock.quantity_added}</TableCell>
                          <TableCell>{formatCurrency(Number(restock.cost_price_per_unit ?? 0))}</TableCell>
                          <TableCell className="font-semibold">{formatCurrency(Number(restock.total_cost ?? 0))}</TableCell>
                          <TableCell className="text-xs capitalize">{String(restock.payment_method ?? '').replaceAll('_', ' ') || '—'}</TableCell>
                          <TableCell className="text-xs">{restock.supplier || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : (
              <EmptyState
                icon={<PackagePlus className="h-7 w-7 text-muted-foreground" />}
                title="No restocks in this period"
                description="Adjust the date range or restock inventory."
              />
            )}
          </TabsContent>

          <TabsContent value="savings" className="space-y-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Savings</p>
                <p className="mt-1 text-lg font-bold">{formatCurrency(stats.savings)}</p>
                <p className="text-[9px] text-muted-foreground">Money moved from available cash to savings</p>
              </CardContent>
            </Card>
            {filtered.savings.length > 0 ? (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Reference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.savings.map((saving) => (
                        <TableRow key={saving.id}>
                          <TableCell>{new Date(saving.savings_date).toLocaleDateString('en-GH')}</TableCell>
                          <TableCell className="font-semibold">{formatCurrency(Number(saving.amount ?? 0))}</TableCell>
                          <TableCell>{saving.source || '—'}</TableCell>
                          <TableCell>{saving.reference || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : (
              <EmptyState
                icon={<PiggyBank className="h-7 w-7 text-muted-foreground" />}
                title="No savings in this period"
                description="Adjust the date range or add savings records."
              />
            )}
          </TabsContent>

          <TabsContent value="investments" className="space-y-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Investments</p>
                <p className="mt-1 text-lg font-bold">{formatCurrency(stats.investments)}</p>
                <p className="text-[9px] text-muted-foreground">Money allocated from available cash to investments</p>
              </CardContent>
            </Card>
            {filtered.investments.length > 0 ? (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Expected Return</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.investments.map((investment) => (
                        <TableRow key={investment.id}>
                          <TableCell className="font-medium">{investment.investment_name}</TableCell>
                          <TableCell className="font-semibold">{formatCurrency(Number(investment.amount ?? 0))}</TableCell>
                          <TableCell>{new Date(investment.investment_date).toLocaleDateString('en-GH')}</TableCell>
                          <TableCell>{formatCurrency(Number(investment.expected_return ?? 0))}</TableCell>
                          <TableCell className="capitalize">{investment.status}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : (
              <EmptyState
                icon={<TrendingUp className="h-7 w-7 text-muted-foreground" />}
                title="No investments in this period"
                description="Adjust the date range or add investment records."
              />
            )}
          </TabsContent>

          <TabsContent value="funding" className="space-y-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Investor Funding</p>
                <p className="mt-1 text-lg font-bold">{formatCurrency(stats.funding)}</p>
                <p className="text-[9px] text-muted-foreground">External money added to the business</p>
              </CardContent>
            </Card>
            {filtered.funding.length > 0 ? (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Investor</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Contact</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.funding.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium">{entry.investor_name}</TableCell>
                          <TableCell className="font-semibold">{formatCurrency(Number(entry.amount ?? 0))}</TableCell>
                          <TableCell>{new Date(entry.date_received).toLocaleDateString('en-GH')}</TableCell>
                          <TableCell className="capitalize">{String(entry.payment_method ?? '').replaceAll('_', ' ') || '—'}</TableCell>
                          <TableCell>{entry.investment_type || '—'}</TableCell>
                          <TableCell className="capitalize">{entry.status}</TableCell>
                          <TableCell className="text-xs">{entry.phone || entry.email || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : (
              <EmptyState
                icon={<HandCoins className="h-7 w-7 text-muted-foreground" />}
                title="No investor funding in this period"
                description="Adjust the date range or add funding records."
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function SummaryMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className={`mt-2 text-lg font-bold ${tone ?? ''}`}>{formatCurrency(value)}</p>
    </div>
  );
}
