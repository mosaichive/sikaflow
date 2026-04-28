import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { formatCurrency } from '@/lib/constants';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useBusiness } from '@/context/BusinessContext';
import { getCreditStatus } from '@/lib/sales-inventory';
import { Eye, Plus, Users, Search } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  location: string | null;
  notes: string | null;
};

type CustomerSale = {
  id: string;
  sale_date: string;
  customer_name: string | null;
  total: number | string;
  amount_paid: number | string;
  balance: number | string;
  payment_status: string | null;
  due_date: string | null;
  payment_method: string | null;
  status: string | null;
};

const emptyForm = { name: '', phone: '', email: '', location: '', notes: '' };

export default function CustomersPage() {
  const { toast } = useToast();
  const { businessId } = useBusiness();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [sales, setSales] = useState<CustomerSale[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetchCustomers = useCallback(async () => {
    const [custRes, salesRes] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('sales').select('id,sale_date,customer_name,total,amount_paid,balance,payment_status,due_date,payment_method,status').order('sale_date', { ascending: false }),
    ]);

    setCustomers((custRes.data || []) as CustomerRow[]);
    setSales((salesRes.data || []) as CustomerSale[]);
  }, []);

  useEffect(() => {
    void fetchCustomers();
    const ch = supabase
      .channel('customers-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => { void fetchCustomers(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => { void fetchCustomers(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [fetchCustomers]);

  const customerRows = useMemo(() => {
    const prepared = customers.map((customer) => {
      const history = sales.filter((sale) => sale.customer_name?.trim().toLowerCase() === customer.name.trim().toLowerCase());
      const totalSpent = history.reduce((sum, sale) => sum + Number(sale.amount_paid ?? 0), 0);
      const totalOwed = history.reduce((sum, sale) => sum + Number(sale.balance ?? 0), 0);
      const paidSales = history.filter((sale) => (sale.payment_status || '').toLowerCase() === 'paid').length;
      const creditSales = history.filter((sale) => Number(sale.balance ?? 0) > 0).length;
      const latestCredit = history.find((sale) => Number(sale.balance ?? 0) > 0);
      return {
        ...customer,
        history,
        totalSpent,
        totalOwed,
        purchaseCount: history.length,
        paidSales,
        creditSales,
        lastPurchaseDate: history[0]?.sale_date || null,
        creditStatus: latestCredit ? getCreditStatus(latestCredit.payment_status, latestCredit.due_date) : 'Paid',
      };
    });

    return prepared.filter((customer) =>
      [customer.name, customer.phone, customer.email, customer.location]
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  }, [customers, sales, search]);

  const activeCustomer = customerRows.find((customer) => customer.id === activeCustomerId) || null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      if (!businessId) throw new Error('No business selected');
      const { error } = await supabase.from('customers').insert({
        ...form,
        business_id: businessId,
      });
      if (error) throw error;
      toast({ title: 'Customer added' });
      setForm(emptyForm);
      setOpen(false);
    } catch (error: any) {
      toast({ title: 'Could not add customer', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout title="Customers">
      <div className="space-y-6">
        <section className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/75 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
            <p className="text-sm text-muted-foreground">
              Track customer details, purchase history, and credit balances without turning the app into bookkeeping software.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search customers..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Add Customer</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Customer</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Location</Label>
                      <Input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Notes</Label>
                      <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Saving...' : 'Add Customer'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Customers</CardTitle>
            </CardHeader>
            <CardContent><p className="text-2xl font-semibold">{customerRows.length}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Paid Purchase Value</CardTitle>
            </CardHeader>
            <CardContent><p className="text-2xl font-semibold">{formatCurrency(customerRows.reduce((sum, row) => sum + row.totalSpent, 0))}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding Credit</CardTitle>
            </CardHeader>
            <CardContent><p className="text-2xl font-semibold text-destructive">{formatCurrency(customerRows.reduce((sum, row) => sum + row.totalOwed, 0))}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Credit Customers</CardTitle>
            </CardHeader>
            <CardContent><p className="text-2xl font-semibold">{customerRows.filter((row) => row.totalOwed > 0).length}</p></CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-0">
            {customerRows.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Purchase History</TableHead>
                      <TableHead>Paid Amount</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Credit Status</TableHead>
                      <TableHead className="text-right">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerRows.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">{customer.name}</TableCell>
                        <TableCell className="text-sm">{customer.phone || '—'}</TableCell>
                        <TableCell className="text-sm">{customer.location || '—'}</TableCell>
                        <TableCell className="text-sm">
                          <div className="space-y-0.5">
                            <p>{customer.purchaseCount} sale{customer.purchaseCount === 1 ? '' : 's'}</p>
                            <p className="text-xs text-muted-foreground">
                              {customer.lastPurchaseDate ? `Last: ${new Date(customer.lastPurchaseDate).toLocaleDateString('en-GH')}` : 'No purchases yet'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold">{formatCurrency(customer.totalSpent)}</TableCell>
                        <TableCell className={customer.totalOwed > 0 ? 'font-semibold text-destructive' : ''}>
                          {formatCurrency(customer.totalOwed)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={customer.totalOwed > 0 ? 'destructive' : 'secondary'}>
                            {customer.creditStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button type="button" variant="outline" size="sm" onClick={() => setActiveCustomerId(customer.id)}>
                            <Eye className="mr-2 h-4 w-4" /> View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                icon={<Users className="h-7 w-7 text-muted-foreground" />}
                title="No customers yet"
                description="Add customers to track their purchases, balances, and credit status."
              />
            )}
          </CardContent>
        </Card>

        <Dialog open={!!activeCustomer} onOpenChange={(openState) => { if (!openState) setActiveCustomerId(null); }}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{activeCustomer?.name || 'Customer Details'}</DialogTitle>
            </DialogHeader>
            {activeCustomer ? (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-4">
                  <MetricCard label="Paid Amount" value={formatCurrency(activeCustomer.totalSpent)} />
                  <MetricCard label="Outstanding" value={formatCurrency(activeCustomer.totalOwed)} tone={activeCustomer.totalOwed > 0 ? 'text-destructive' : ''} />
                  <MetricCard label="Purchases" value={String(activeCustomer.purchaseCount)} />
                  <MetricCard label="Credit Status" value={activeCustomer.creditStatus} />
                </div>

                <div className="grid gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Phone</p>
                    <p className="mt-1 text-sm">{activeCustomer.phone || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Location</p>
                    <p className="mt-1 text-sm">{activeCustomer.location || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Email</p>
                    <p className="mt-1 text-sm">{activeCustomer.email || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Notes</p>
                    <p className="mt-1 text-sm">{activeCustomer.notes || '—'}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <h3 className="text-lg font-semibold">Purchase History</h3>
                    <p className="text-sm text-muted-foreground">Paid amounts count toward business money. Unpaid balances stay visible here.</p>
                  </div>
                  {activeCustomer.history.length > 0 ? (
                    <div className="overflow-hidden rounded-2xl border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Payment Method</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-right">Paid</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
                            <TableHead>Due Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activeCustomer.history.map((sale) => (
                            <TableRow key={sale.id}>
                              <TableCell>{new Date(sale.sale_date).toLocaleDateString('en-GH')}</TableCell>
                              <TableCell>
                                <Badge variant={Number(sale.balance ?? 0) > 0 ? 'destructive' : 'secondary'}>
                                  {getCreditStatus(sale.payment_status, sale.due_date)}
                                </Badge>
                              </TableCell>
                              <TableCell className="capitalize">{(sale.payment_method || 'cash').replace('_', ' ')}</TableCell>
                              <TableCell className="text-right">{formatCurrency(Number(sale.total ?? 0))}</TableCell>
                              <TableCell className="text-right font-semibold">{formatCurrency(Number(sale.amount_paid ?? 0))}</TableCell>
                              <TableCell className="text-right text-destructive">{formatCurrency(Number(sale.balance ?? 0))}</TableCell>
                              <TableCell>{sale.due_date ? new Date(sale.due_date).toLocaleDateString('en-GH') : '—'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <EmptyState
                      icon={<Users className="h-7 w-7 text-muted-foreground" />}
                      title="No purchase history yet"
                      description="This customer will appear here once they start buying."
                    />
                  )}
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

function MetricCard({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
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
