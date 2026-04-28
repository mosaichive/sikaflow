import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, OTHER_INCOME_CATEGORIES, PAYMENT_METHODS, SIKAFLOW_TOOLTIPS } from '@/lib/constants';
import { Banknote, Plus, Trash2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type OtherIncomeRow = {
  id: string;
  category: string;
  amount: number | string;
  income_date: string;
  payment_method: string;
  description: string;
  attachment_name?: string | null;
  attachment_path?: string | null;
  recorded_by_name?: string | null;
};

export default function OtherIncomePage() {
  const { user, displayName, isAdmin, isManager } = useAuth();
  const { businessId } = useBusiness();
  const { toast } = useToast();
  const [rows, setRows] = useState<OtherIncomeRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [form, setForm] = useState({
    category: OTHER_INCOME_CATEGORIES[0],
    amount: '',
    income_date: new Date().toISOString().slice(0, 10),
    payment_method: PAYMENT_METHODS[0].value,
    description: '',
  });

  const canManage = isAdmin || isManager;

  const fetchRows = useCallback(async () => {
    const { data } = await supabase.from('other_income' as any).select('*').order('income_date', { ascending: false });
    setRows((data || []) as OtherIncomeRow[]);
  }, []);

  useEffect(() => {
    void fetchRows();
    const channel = supabase
      .channel('other-income-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'other_income' }, () => { void fetchRows(); })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchRows]);

  const totalOtherIncome = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [rows],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !businessId) return;
    setLoading(true);

    try {
      let attachmentPath: string | null = null;
      let attachmentName: string | null = null;

      if (attachment) {
        const ext = attachment.name.split('.').pop() || 'png';
        const path = `${businessId}/${Date.now()}-${attachment.name.replace(/\s+/g, '-')}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('other-income-receipts').upload(path, attachment, { upsert: true });
        if (uploadError) throw uploadError;
        attachmentPath = path;
        attachmentName = attachment.name;
      }

      const { error } = await supabase.from('other_income' as any).insert({
        business_id: businessId,
        category: form.category,
        amount: Number(form.amount || 0),
        income_date: form.income_date,
        payment_method: form.payment_method,
        description: form.description,
        attachment_path: attachmentPath,
        attachment_name: attachmentName,
        recorded_by: user.id,
        recorded_by_name: displayName || user.email || '',
      });
      if (error) throw error;

      toast({ title: 'Other income saved', description: 'This income now contributes to available business money.' });
      setForm({
        category: OTHER_INCOME_CATEGORIES[0],
        amount: '',
        income_date: new Date().toISOString().slice(0, 10),
        payment_method: PAYMENT_METHODS[0].value,
        description: '',
      });
      setAttachment(null);
      setOpen(false);
    } catch (error) {
      toast({
        title: 'Could not save other income',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('other_income' as any).delete().eq('id', id);
    if (error) {
      toast({ title: 'Could not delete entry', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Other income deleted' });
  };

  return (
    <AppLayout title="Other Income">
      <div className="space-y-6">
        <section className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/75 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Other Income</h1>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-xs text-muted-foreground underline decoration-dotted underline-offset-4">
                    What is this?
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-sm">
                  {SIKAFLOW_TOOLTIPS.otherIncome}
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-sm text-muted-foreground">
              Record business income that does not come from product sales, like services, commissions, delivery fees, and miscellaneous income.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-border bg-background px-4 py-3 text-right">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Total Other Income</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{formatCurrency(totalOtherIncome)}</p>
            </div>

            {canManage ? (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="mr-2 h-4 w-4" /> Add Other Income</Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Add Other Income</DialogTitle>
                  </DialogHeader>
                  <form className="space-y-4" onSubmit={handleSubmit}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Income Category</Label>
                        <Select value={form.category} onValueChange={(value) => setForm((current) => ({ ...current, category: value }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {OTHER_INCOME_CATEGORIES.map((category) => (
                              <SelectItem key={category} value={category}>{category}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Amount</Label>
                        <Input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Date</Label>
                        <Input type="date" value={form.income_date} onChange={(event) => setForm((current) => ({ ...current, income_date: event.target.value }))} required />
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
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Description</Label>
                        <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={4} placeholder="Explain what this income was for." />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Attachment / Receipt (optional)</Label>
                        <Input type="file" accept="image/*,.pdf" onChange={(event) => setAttachment(event.target.files?.[0] || null)} />
                      </div>
                    </div>

                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? 'Saving...' : 'Save Other Income'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
        </section>

        <Card className="border-border/70">
          <CardContent className="p-0">
            {rows.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Payment Method</TableHead>
                      <TableHead>Recorded By</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      {canManage ? <TableHead className="w-[80px]" /> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{new Date(row.income_date).toLocaleDateString('en-GH')}</TableCell>
                        <TableCell>{row.category}</TableCell>
                        <TableCell className="max-w-[260px] truncate">{row.description || '—'}</TableCell>
                        <TableCell>{PAYMENT_METHODS.find((method) => method.value === row.payment_method)?.label || row.payment_method}</TableCell>
                        <TableCell>{row.recorded_by_name || '—'}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-500">{formatCurrency(Number(row.amount || 0))}</TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void handleDelete(row.id)}>
                              <Trash2 className="h-4 w-4" />
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
                icon={<Banknote className="h-7 w-7 text-muted-foreground" />}
                title="No other income yet"
                description="Record service income, delivery fees, commissions, and other non-product income here."
                action={canManage ? <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> Add Other Income</Button> : undefined}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
