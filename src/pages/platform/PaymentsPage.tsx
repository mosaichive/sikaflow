import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, CheckCircle2, Clock3, Search } from 'lucide-react';

type Row = {
  id: string;
  business_id: string;
  plan: string;
  requested_plan?: string | null;
  resolved_plan?: string | null;
  amount_ghs: number;
  amount_paid_ghs?: number | null;
  method: string;
  status: string;
  reference: string | null;
  paystack_reference?: string | null;
  payer_name: string | null;
  payer_phone: string | null;
  network?: string | null;
  payment_date: string;
  created_at: string;
  note: string | null;
  review_reason?: string | null;
  expires_at?: string | null;
  gateway_status?: string | null;
  gateway_message?: string | null;
  businesses: { name: string } | null;
};

const STATUS_FILTERS = ['all', 'pending', 'review', 'confirmed', 'failed', 'cancelled', 'timeout', 'rejected'] as const;

export default function PaymentsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('payments' as any)
      .select('*,businesses(name)')
      .order('created_at', { ascending: false });
    setRows((data as Row[]) ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase.channel('platform-payments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, () => { void load(); })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const act = async (id: string, action: 'confirm_payment' | 'reject_payment') => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('manage-subscription', { body: { action, payment_id: id } });
    setBusy(false);

    if (error || (data as any)?.error) {
      toast({ title: 'Failed', description: (data as any)?.error || error?.message, variant: 'destructive' });
      return;
    }

    toast({
      title: action === 'confirm_payment' ? 'Payment confirmed' : 'Payment rejected',
      description: action === 'confirm_payment'
        ? ((data as any)?.status === 'review' ? 'The row stayed in review after validation.' : 'Subscription updated successfully.')
        : 'The payment has been marked rejected.',
    });
    await load();
  };

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const haystack = [
        row.businesses?.name,
        row.reference,
        row.paystack_reference,
        row.payer_phone,
        row.payer_name,
        row.network,
        row.plan,
        row.resolved_plan,
      ].join(' ').toLowerCase();
      return haystack.includes(search.trim().toLowerCase());
    });
  }, [rows, search, statusFilter]);

  const summary = useMemo(() => {
    const confirmed = rows.filter((row) => row.status === 'confirmed');
    return {
      pending: rows.filter((row) => row.status === 'pending').length,
      review: rows.filter((row) => row.status === 'review').length,
      confirmed: confirmed.length,
      revenue: confirmed.reduce((sum, row) => sum + Number(row.amount_paid_ghs ?? row.amount_ghs ?? 0), 0),
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">Live payment feed for Paystack, Ghana MoMo prompts, and manual fallback submissions.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="Pending" value={summary.pending} tone="text-amber-500" icon={<Clock3 className="h-4 w-4" />} />
        <SummaryCard label="Needs Review" value={summary.review} tone="text-orange-500" icon={<AlertTriangle className="h-4 w-4" />} />
        <SummaryCard label="Confirmed" value={summary.confirmed} tone="text-emerald-500" icon={<CheckCircle2 className="h-4 w-4" />} />
        <SummaryCard label="Revenue" value={`GH₵${summary.revenue.toLocaleString()}`} tone="text-primary" icon={<CheckCircle2 className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Subscription Payments</CardTitle>
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search business, ref, phone, network..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as (typeof STATUS_FILTERS)[number])}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((status) => (
                  <SelectItem key={status} value={status}>{status === 'all' ? 'All statuses' : status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Business</th>
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Payer</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">Expiry</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const displayPlan = row.resolved_plan || row.plan;
                  const amount = Number(row.amount_paid_ghs ?? row.amount_ghs ?? 0);
                  return (
                    <tr key={row.id} className="border-b border-border/50 align-top">
                      <td className="px-3 py-3 text-[11px] text-muted-foreground">{new Date(row.created_at || row.payment_date).toLocaleString()}</td>
                      <td className="px-3 py-3">
                        <div className="font-medium">{row.businesses?.name ?? '—'}</div>
                        <div className="text-[11px] text-muted-foreground">{row.method.replace(/_/g, ' ')}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="w-fit text-[10px]">{displayPlan}</Badge>
                          {row.requested_plan && row.resolved_plan && row.requested_plan !== row.resolved_plan && (
                            <span className="text-[10px] text-muted-foreground">Requested: {row.requested_plan}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold">GH₵{amount.toLocaleString()}</div>
                        {row.review_reason && <div className="text-[10px] text-orange-600">{row.review_reason.replace(/_/g, ' ')}</div>}
                      </td>
                      <td className="px-3 py-3 text-[11px]">
                        <div>{row.payer_name || '—'}</div>
                        <div className="text-muted-foreground">{row.payer_phone || '—'}{row.network ? ` · ${row.network}` : ''}</div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={row.status} />
                        <div className="mt-1 max-w-[220px] text-[10px] text-muted-foreground">
                          {row.gateway_message || row.gateway_status || '—'}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[11px] font-mono">
                        <div>{row.reference || row.paystack_reference || '—'}</div>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-muted-foreground">
                        {row.expires_at ? new Date(row.expires_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {(row.status === 'pending' || row.status === 'review') ? (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" disabled={busy} onClick={() => act(row.id, 'confirm_payment')}>Confirm</Button>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(row.id, 'reject_payment')}>Reject</Button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-sm text-muted-foreground">No payments match the current filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, tone, icon }: { label: string; value: number | string; tone: string; icon: ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground ${tone}`}>
          {icon}
          <span>{label}</span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const variant = normalized === 'confirmed'
    ? 'default'
    : normalized === 'pending'
      ? 'secondary'
      : normalized === 'review'
        ? 'outline'
        : 'destructive';

  return (
    <Badge
      variant={variant as 'default' | 'secondary' | 'outline' | 'destructive'}
      className={normalized === 'review' ? 'border-amber-500/40 text-amber-600' : ''}
    >
      {normalized}
    </Badge>
  );
}
