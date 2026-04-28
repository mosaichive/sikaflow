import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { formatCurrency, EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/lib/constants';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Receipt, X, Paperclip, Trash2, WalletCards } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type ExpenseRow = {
  id: string;
  category: string;
  amount: number | string;
  expense_date: string;
  description: string | null;
  payment_method: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  recorded_by_name: string | null;
};

const defaultForm = {
  category: EXPENSE_CATEGORIES[0] ?? 'Miscellaneous',
  description: '',
  amount: '',
  expense_date: new Date().toISOString().slice(0, 10),
  payment_method: PAYMENT_METHODS[0].value,
};

function matchesDateRange(dateValue: string, from: string, to: string) {
  const time = new Date(dateValue).getTime();
  if (from && time < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && time > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
}

export default function ExpensesPage() {
  const { user, displayName, isAdmin, isManager } = useAuth();
  const { businessId } = useBusiness();
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [attachmentKey, setAttachmentKey] = useState(0);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [form, setForm] = useState(defaultForm);

  const canManage = isAdmin || isManager;

  const fetchExpenses = useCallback(async () => {
    const { data } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false });
    setExpenses((data || []) as ExpenseRow[]);
  }, []);

  useEffect(() => {
    void fetchExpenses();
    const ch = supabase
      .channel('expenses-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => {
        void fetchExpenses();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [fetchExpenses]);

  const filteredExpenses = useMemo(
    () => expenses.filter((expense) => matchesDateRange(expense.expense_date, dateFrom, dateTo)),
    [expenses, dateFrom, dateTo],
  );

  const total = filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
  const hasDateFilter = !!dateFrom || !!dateTo;

  const resetForm = () => {
    setForm(defaultForm);
    setReceiptFile(null);
    setAttachmentKey((value) => value + 1);
  };

  const handleReceiptChange = (file: File | null) => {
    if (!file) {
      setReceiptFile(null);
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: 'Unsupported receipt file',
        description: 'Upload a JPG, PNG, WEBP, or PDF receipt.',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Receipt too large',
        description: 'Keep receipt uploads under 5MB.',
        variant: 'destructive',
      });
      return;
    }

    setReceiptFile(file);
  };

  const uploadReceipt = async () => {
    if (!receiptFile || !businessId || !user) return null;
    const safeName = receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `${businessId}/${user.id}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from('expense-receipts').upload(path, receiptFile, { upsert: true });
    if (error) throw error;
    return { path, name: receiptFile.name };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !businessId) return;
    const amount = Number(form.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: 'Enter a valid amount',
        description: 'Expense amount must be greater than zero.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const receipt = await uploadReceipt();
      const { error } = await supabase.from('expenses').insert({
        business_id: businessId,
        category: form.category,
        description: form.description.trim(),
        amount,
        expense_date: form.expense_date,
        payment_method: form.payment_method,
        attachment_path: receipt?.path ?? null,
        attachment_name: receipt?.name ?? null,
        recorded_by: user.id,
        recorded_by_name: displayName || user.email || 'Team member',
      });
      if (error) throw error;
      toast({ title: 'Expense recorded', description: 'This expense now reduces available business money and profit.' });
      resetForm();
      setOpen(false);
    } catch (error: any) {
      toast({ title: 'Could not record expense', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReceipt = async (expense: ExpenseRow) => {
    if (!expense.attachment_path) return;
    setOpeningAttachmentId(expense.id);
    try {
      const { data, error } = await supabase.storage.from('expense-receipts').createSignedUrl(expense.attachment_path, 60);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      toast({ title: 'Could not open receipt', description: error.message, variant: 'destructive' });
    } finally {
      setOpeningAttachmentId(null);
    }
  };

  const handleDelete = async (expense: ExpenseRow) => {
    if (!canManage) return;
    const confirmed = window.confirm('Delete this expense entry?');
    if (!confirmed) return;
    setDeletingId(expense.id);
    try {
      if (expense.attachment_path) {
        await supabase.storage.from('expense-receipts').remove([expense.attachment_path]);
      }
      const { error } = await supabase.from('expenses').delete().eq('id', expense.id);
      if (error) throw error;
      toast({ title: 'Expense deleted' });
    } catch (error: any) {
      toast({ title: 'Could not delete expense', description: error.message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AppLayout title="Expenses">
      <div className="space-y-6">
        <section className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/75 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
            <p className="text-sm text-muted-foreground">
              Keep business expenses simple: category, amount, payment method, date, notes, and optional receipt.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="expenses-from" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                From
              </Label>
              <Input id="expenses-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="w-40" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="expenses-to" className="text-[10px] uppercase tracking-wider text-muted-foreground">
                To
              </Label>
              <Input id="expenses-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="w-40" />
            </div>
            {hasDateFilter ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>
                <X className="mr-1 h-4 w-4" /> Clear
              </Button>
            ) : null}
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Add Expense</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Record Expense</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={form.category} onValueChange={(value) => setForm((current) => ({ ...current, category: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {EXPENSE_CATEGORIES.map((category) => (
                            <SelectItem key={category} value={category}>{category}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Payment Method</Label>
                      <Select value={form.payment_method} onValueChange={(value) => setForm((current) => ({ ...current, payment_method: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((method) => (
                            <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Amount (GH₵)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.amount}
                        onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={form.expense_date}
                        onChange={(event) => setForm((current) => ({ ...current, expense_date: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Description</Label>
                      <Textarea
                        value={form.description}
                        onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                        placeholder="What was this expense for?"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Receipt (optional)</Label>
                      <Input
                        key={attachmentKey}
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,.pdf"
                        onChange={(event) => handleReceiptChange(event.target.files?.[0] ?? null)}
                      />
                      <p className="text-xs text-muted-foreground">Upload a JPG, PNG, WEBP, or PDF receipt up to 5MB.</p>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Saving...' : 'Record Expense'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Expenses in Range</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{filteredExpenses.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{formatCurrency(total)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Payment Methods</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <WalletCards className="h-9 w-9 text-primary" />
              <p className="text-sm text-muted-foreground">Cash, MoMo, bank transfer, and card are tracked per expense.</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-0">
            {filteredExpenses.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Receipt</TableHead>
                      <TableHead>Recorded By</TableHead>
                      {canManage ? <TableHead className="text-right">Action</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell className="text-xs">{new Date(expense.expense_date).toLocaleDateString('en-GH')}</TableCell>
                        <TableCell>{expense.category}</TableCell>
                        <TableCell className="max-w-[260px] whitespace-normal text-sm text-muted-foreground">
                          {expense.description || '—'}
                        </TableCell>
                        <TableCell>{PAYMENT_METHODS.find((method) => method.value === expense.payment_method)?.label ?? 'Cash'}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(Number(expense.amount ?? 0))}</TableCell>
                        <TableCell>
                          {expense.attachment_path ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void handleOpenReceipt(expense)}
                              disabled={openingAttachmentId === expense.id}
                            >
                              <Paperclip className="mr-2 h-4 w-4" />
                              {openingAttachmentId === expense.id ? 'Opening...' : expense.attachment_name || 'Open'}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">No receipt</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{expense.recorded_by_name || '—'}</TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => void handleDelete(expense)}
                              disabled={deletingId === expense.id}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {deletingId === expense.id ? 'Deleting...' : 'Delete'}
                            </Button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                icon={<Receipt className="h-7 w-7 text-muted-foreground" />}
                title={expenses.length > 0 ? 'No expenses in this date range' : 'No expenses recorded'}
                description={
                  expenses.length > 0
                    ? 'Clear or adjust the date filter to find older expenses.'
                    : 'Start recording everyday business expenses here.'
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
