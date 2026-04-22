import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { formatCurrency } from '@/lib/constants';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart3, LineChart as LineChartIcon, PiggyBank, TrendingUp, HandCoins, PackagePlus } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [stats, setStats] = useState({ revenue: 0, cost: 0, grossProfit: 0, expenses: 0, netProfit: 0, savings: 0, investments: 0, funding: 0, restockSpending: 0, availableCash: 0 });
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [savingsData, setSavingsData] = useState<any[]>([]);
  const [investData, setInvestData] = useState<any[]>([]);
  const [fundingData, setFundingData] = useState<any[]>([]);
  const [restockData, setRestockData] = useState<any[]>([]);
  const [salesChartType, setSalesChartType] = useState<'bar' | 'line'>('bar');

  useEffect(() => { fetchReport(); }, [dateFrom, dateTo]);

  useEffect(() => {
    const ch = supabase.channel('reports-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, fetchReport)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items' }, fetchReport)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, fetchReport)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'savings' }, fetchReport)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investments' }, fetchReport)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investor_funding' }, fetchReport)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restocks' }, fetchReport)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [dateFrom, dateTo]);

  const fetchReport = async () => {
    const from = new Date(dateFrom).toISOString();
    const to = new Date(dateTo + 'T23:59:59').toISOString();

    const [salesRes, itemsRes, expRes, savRes, invRes, funRes, restockRes] = await Promise.all([
      supabase.from('sales').select('*').gte('sale_date', from).lte('sale_date', to),
      supabase.from('sale_items').select('*'),
      supabase.from('expenses').select('*').gte('expense_date', from).lte('expense_date', to),
      supabase.from('savings').select('*').gte('savings_date', from).lte('savings_date', to).order('savings_date', { ascending: false }),
      supabase.from('investments').select('*').gte('investment_date', from).lte('investment_date', to).order('investment_date', { ascending: false }),
      supabase.from('investor_funding').select('*').gte('date_received', from).lte('date_received', to).order('date_received', { ascending: false }),
      supabase.from('restocks').select('*').gte('restock_date', from).lte('restock_date', to).order('restock_date', { ascending: false }),
    ]);

    const sales = salesRes.data || [];
    const items = itemsRes.data || [];
    const expenses = expRes.data || [];
    const savings = (savRes.data || []) as any[];
    const investments = (invRes.data || []) as any[];
    const fundings = (funRes.data || []) as any[];
    const restocks = (restockRes.data || []) as any[];

    const saleIds = new Set(sales.map(s => s.id));
    const filteredItems = items.filter(i => saleIds.has(i.sale_id));

    const revenue = sales.reduce((s, r) => s + Number(r.total), 0);
    const cost = filteredItems.reduce((s, i) => s + Number(i.cost_price) * i.quantity, 0);
    const grossProfit = revenue - cost;
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const totalSavings = savings.reduce((s, r) => s + Number(r.amount), 0);
    const totalInvest = investments.reduce((s, r) => s + Number(r.amount), 0);
    const totalFunding = fundings.reduce((s, r) => s + Number(r.amount), 0);
    const totalRestock = restocks.reduce((s, r) => s + Number(r.total_cost), 0);
    const availableCash = revenue + totalFunding - totalExpenses - totalSavings - totalInvest - totalRestock;

    setStats({ revenue, cost, grossProfit, expenses: totalExpenses, netProfit: grossProfit - totalExpenses, savings: totalSavings, investments: totalInvest, funding: totalFunding, restockSpending: totalRestock, availableCash });

    const catMap: Record<string, number> = {};
    filteredItems.forEach(i => {
      const cat = i.product_name || 'Other';
      catMap[cat] = (catMap[cat] || 0) + Number(i.line_total);
    });
    setCategoryData(Object.entries(catMap).map(([name, value]) => ({ name, value })));

    setSavingsData(savings);
    setInvestData(investments);
    setFundingData(fundings);
    setRestockData(restocks);
  };

  return (
    <AppLayout title="Reports">
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-wrap items-end gap-4">
          <div><Label className="text-xs">From</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" /></div>
        </div>

        {/* Financial Summary */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Financial Summary (Period)</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Sales Revenue', value: stats.revenue, sub: 'Income' },
              { label: 'Investor Funding', value: stats.funding, sub: 'External money added' },
              { label: 'Expenses', value: stats.expenses, sub: 'Outflow' },
              { label: 'Savings', value: stats.savings, sub: 'Allocated from cash' },
              { label: 'Investments', value: stats.investments, sub: 'Allocated from cash' },
              { label: 'Restock Spending', value: stats.restockSpending, sub: 'Inventory purchases' },
            ].map(s => (
              <Card key={s.label}><CardContent className="p-4 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                <p className="text-lg font-bold mt-1">{formatCurrency(s.value)}</p>
                <p className="text-[9px] text-muted-foreground">{s.sub}</p>
              </CardContent></Card>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardContent className="p-4 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gross Profit</p>
            <p className={`text-lg font-bold mt-1 ${stats.grossProfit < 0 ? 'text-destructive' : ''}`}>{formatCurrency(stats.grossProfit)}</p>
            <p className="text-[9px] text-muted-foreground">Revenue − Cost of Goods</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Net Profit</p>
            <p className={`text-lg font-bold mt-1 ${stats.netProfit < 0 ? 'text-destructive' : ''}`}>{formatCurrency(stats.netProfit)}</p>
            <p className="text-[9px] text-muted-foreground">Gross Profit − Expenses</p>
          </CardContent></Card>
          <Card className="border-primary/30 bg-primary/5"><CardContent className="p-4 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Available Cash (Period)</p>
            <p className={`text-lg font-bold mt-1 ${stats.availableCash < 0 ? 'text-destructive' : 'text-primary'}`}>{formatCurrency(stats.availableCash)}</p>
            <p className="text-[9px] text-muted-foreground">Revenue + Funding − Expenses − Savings − Investments − Restocks</p>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="sales">
          <TabsList>
            <TabsTrigger value="sales">Sales</TabsTrigger>
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
                {categoryData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    {salesChartType === 'bar' ? (
                      <BarChart data={categoryData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    ) : (
                      <LineChart data={categoryData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                ) : (
                  <EmptyState icon={<BarChart3 className="h-7 w-7 text-muted-foreground" />} title="No report data" description="Reports will populate once you have sales." />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="restocks" className="space-y-4">
            <Card><CardContent className="p-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Restock Spending (Period)</p>
              <p className="text-lg font-bold mt-1">{formatCurrency(stats.restockSpending)}</p>
              <p className="text-[9px] text-muted-foreground">Inventory restock purchases deducted from available cash</p>
            </CardContent></Card>
            {restockData.length > 0 ? (
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Product</TableHead><TableHead>SKU</TableHead>
                    <TableHead>Qty</TableHead><TableHead>Cost/Unit</TableHead><TableHead>Total Cost</TableHead>
                    <TableHead>Payment</TableHead><TableHead>Supplier</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {restockData.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">{new Date(r.restock_date).toLocaleDateString()}</TableCell>
                        <TableCell className="font-medium">{r.product_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.sku}</TableCell>
                        <TableCell className="font-semibold">{r.quantity_added}</TableCell>
                        <TableCell>{formatCurrency(Number(r.cost_price_per_unit))}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(Number(r.total_cost))}</TableCell>
                        <TableCell className="text-xs capitalize">{r.payment_method?.replace('_', ' ')}</TableCell>
                        <TableCell className="text-xs">{r.supplier || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
            ) : (
              <EmptyState icon={<PackagePlus className="h-7 w-7 text-muted-foreground" />} title="No restocks in this period" description="Adjust the date range or restock inventory." />
            )}
          </TabsContent>

          <TabsContent value="savings" className="space-y-4">
            <Card><CardContent className="p-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Savings (Period)</p>
              <p className="text-lg font-bold mt-1">{formatCurrency(stats.savings)}</p>
              <p className="text-[9px] text-muted-foreground">Money moved from available cash to savings</p>
            </CardContent></Card>
            {savingsData.length > 0 ? (
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Source</TableHead><TableHead>Reference</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {savingsData.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell>{new Date(s.savings_date).toLocaleDateString()}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(Number(s.amount))}</TableCell>
                        <TableCell>{s.source || '—'}</TableCell>
                        <TableCell>{s.reference || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
            ) : (
              <EmptyState icon={<PiggyBank className="h-7 w-7 text-muted-foreground" />} title="No savings in this period" description="Adjust the date range or add savings records." />
            )}
          </TabsContent>

          <TabsContent value="investments" className="space-y-4">
            <Card><CardContent className="p-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Investments (Period)</p>
              <p className="text-lg font-bold mt-1">{formatCurrency(stats.investments)}</p>
              <p className="text-[9px] text-muted-foreground">Money allocated from available cash to investments</p>
            </CardContent></Card>
            {investData.length > 0 ? (
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Name</TableHead><TableHead>Amount</TableHead><TableHead>Date</TableHead><TableHead>Expected Return</TableHead><TableHead>Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {investData.map((i: any) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-medium">{i.investment_name}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(Number(i.amount))}</TableCell>
                        <TableCell>{new Date(i.investment_date).toLocaleDateString()}</TableCell>
                        <TableCell>{formatCurrency(Number(i.expected_return))}</TableCell>
                        <TableCell className="capitalize">{i.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
            ) : (
              <EmptyState icon={<TrendingUp className="h-7 w-7 text-muted-foreground" />} title="No investments in this period" description="Adjust the date range or add investment records." />
            )}
          </TabsContent>

          <TabsContent value="funding" className="space-y-4">
            <Card><CardContent className="p-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Investor Funding (Period)</p>
              <p className="text-lg font-bold mt-1">{formatCurrency(stats.funding)}</p>
              <p className="text-[9px] text-muted-foreground">External money added to business</p>
            </CardContent></Card>
            {fundingData.length > 0 ? (
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Investor</TableHead><TableHead>Amount</TableHead><TableHead>Date</TableHead>
                    <TableHead>Method</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Contact</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {fundingData.map((f: any) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{f.investor_name}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(Number(f.amount))}</TableCell>
                        <TableCell>{new Date(f.date_received).toLocaleDateString()}</TableCell>
                        <TableCell className="capitalize">{f.payment_method.replace('_', ' ')}</TableCell>
                        <TableCell>{f.investment_type || '—'}</TableCell>
                        <TableCell className="capitalize">{f.status}</TableCell>
                        <TableCell className="text-xs">{f.phone || f.email || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
            ) : (
              <EmptyState icon={<HandCoins className="h-7 w-7 text-muted-foreground" />} title="No investor funding in this period" description="Adjust the date range or add investor funding records." />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
