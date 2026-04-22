import { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { formatCurrency, EXPENSE_CATEGORIES } from '@/lib/constants';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Receipt, X } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function matchesDateRange(dateValue: string, from: string, to: string) {
  const time = new Date(dateValue).getTime();
  if (from && time < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && time > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
}

export default function ExpensesPage() {
  const { user, displayName, isAdmin } = useAuth();
  const { businessId } = useBusiness();
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [form, setForm] = useState({ category: 'Miscellaneous', description: '', amount: 0, expense_date: new Date().toISOString().slice(0, 10) });

  useEffect(() => {
    fetchExpenses();
    const ch = supabase.channel('expenses-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, fetchExpenses)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchExpenses = async () => {
    const { data } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false });
    setExpenses(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !businessId) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('expenses').insert({
        business_id: businessId,
        category: form.category,
        description: form.description,
        amount: form.amount,
        expense_date: form.expense_date,
        recorded_by: user.id,
        recorded_by_name: displayName,
      });
      if (error) throw error;
      toast({ title: 'Expense recorded!' });
      setForm({ category: 'Miscellaneous', description: '', amount: 0, expense_date: new Date().toISOString().slice(0, 10) });
      setOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
  };

  const filteredExpenses = useMemo(
    () => expenses.filter((expense) => matchesDateRange(expense.expense_date, dateFrom, dateTo)),
    [expenses, dateFrom, dateTo],
  );
  const hasDateFilter = !!dateFrom || !!dateTo;
  const total = filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <AppLayout title="Expenses">
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="expenses-from" className="text-[10px] uppercase tracking-wider text-muted-foreground">From</Label>
              <Input id="expenses-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="w-40" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="expenses-to" className="text-[10px] uppercase tracking-wider text-muted-foreground">To</Label>
              <Input id="expenses-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="w-40" />
            </div>
            {hasDateFilter && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>
                <X className="mr-1 h-4 w-4" /> Clear
              </Button>
            )}
            <p className="pb-2 text-xs text-muted-foreground">Showing {filteredExpenses.length} of {expenses.length}</p>
          </div>
          <div className="flex items-center justify-between gap-3 lg:justify-end">
          <p className="text-sm text-muted-foreground">Total: <span className="font-semibold text-foreground">{formatCurrency(total)}</span></p>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Add Expense</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record Expense</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Amount (GH₵)</Label><Input type="number" min={0} step="0.01" required value={form.amount} onChange={e => setForm({...form, amount: Number(e.target.value)})} /></div>
                  <div><Label>Date</Label><Input type="date" value={form.expense_date} onChange={e => setForm({...form, expense_date: e.target.value})} /></div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Saving...' : 'Record Expense'}</Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
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
                      <TableHead>Amount</TableHead>
                      <TableHead>Recorded By</TableHead>
                      {isAdmin && <TableHead></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.map(exp => (
                      <TableRow key={exp.id}>
                        <TableCell className="text-xs">{new Date(exp.expense_date).toLocaleDateString()}</TableCell>
                        <TableCell>{exp.category}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{exp.description || '—'}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(Number(exp.amount))}</TableCell>
                        <TableCell className="text-sm">{exp.recorded_by_name || '—'}</TableCell>
                        {isAdmin && (
                          <TableCell>
                            <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => handleDelete(exp.id)}>Delete</Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState icon={<Receipt className="h-7 w-7 text-muted-foreground" />} title={expenses.length > 0 ? 'No expenses in this date range' : 'No expenses recorded'} description={expenses.length > 0 ? 'Clear or adjust the date filter to find older expenses.' : 'Track your business expenses here.'} />
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
