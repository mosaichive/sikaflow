import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Gift, Search, ShieldAlert, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { referralReasonLabel, referralStatusLabel, REFERRAL_SLOT_LIMIT } from '@/lib/referrals';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

type ReferralAccountRow = {
  id: string;
  business_id: string;
  referral_code: string;
  current_cycle_started_at: string | null;
  current_cycle_ends_at: string | null;
  current_cycle_rewarded_count: number;
  lifetime_rewarded_count: number;
  last_reward_applied_at: string | null;
};

type ReferralRow = {
  id: string;
  referral_account_id: string;
  referrer_user_id: string;
  referrer_business_id: string;
  referred_user_id: string;
  referred_business_id: string | null;
  referred_email: string | null;
  referred_phone: string | null;
  status: string;
  validation_reason: string | null;
  created_at: string;
  converted_at: string | null;
  reward_applied_at: string | null;
  reward_months: number;
  subscribed_plan: string | null;
};

const STATUS_FILTERS = ['all', 'pending', 'rewarded', 'flagged', 'invalid', 'successful'] as const;

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GH');
}

export default function ReferralsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<ReferralAccountRow[]>([]);
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [businessMap, setBusinessMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const [accountsRes, rowsRes] = await Promise.all([
      supabase
        .from('referral_accounts' as any)
        .select('*')
        .order('current_cycle_rewarded_count', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('referrals' as any)
        .select('*')
        .order('created_at', { ascending: false }),
    ]);

    const nextAccounts = (accountsRes.data as ReferralAccountRow[]) ?? [];
    const nextRows = (rowsRes.data as ReferralRow[]) ?? [];
    setAccounts(nextAccounts);
    setRows(nextRows);

    const businessIds = Array.from(new Set([
      ...nextAccounts.map((account) => account.business_id),
      ...nextRows.map((row) => row.referrer_business_id),
      ...nextRows.map((row) => row.referred_business_id).filter(Boolean) as string[],
    ]));

    if (businessIds.length > 0) {
      const { data: businesses } = await supabase
        .from('businesses' as any)
        .select('id,name')
        .in('id', businessIds);
      setBusinessMap(Object.fromEntries(((businesses as { id: string; name: string }[]) ?? []).map((business) => [business.id, business.name])));
    } else {
      setBusinessMap({});
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('platform-referrals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'referral_accounts' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'referrals' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, () => { void load(); })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const accountMap = useMemo(
    () => Object.fromEntries(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const haystack = [
        businessMap[row.referrer_business_id],
        businessMap[row.referred_business_id ?? ''],
        row.referred_email,
        row.referred_phone,
        row.status,
        row.validation_reason,
      ].join(' ').toLowerCase();
      return haystack.includes(search.trim().toLowerCase());
    });
  }, [businessMap, rows, search, statusFilter]);

  const summary = useMemo(() => {
    return {
      accounts: accounts.length,
      rewardedThisCycle: accounts.reduce((sum, account) => sum + Number(account.current_cycle_rewarded_count ?? 0), 0),
      pending: rows.filter((row) => row.status === 'pending').length,
      flagged: rows.filter((row) => row.status === 'flagged').length,
    };
  }, [accounts, rows]);

  const setFlagState = async (row: ReferralRow, nextFlagged: boolean) => {
    setBusyId(row.id);
    const payload = nextFlagged
      ? { status: 'flagged', validation_reason: 'manual_flag', flagged_by: user?.id }
      : { status: 'pending', validation_reason: '', flagged_by: null };

    const { error } = await supabase
      .from('referrals' as any)
      .update(payload)
      .eq('id', row.id);

    setBusyId(null);

    if (error) {
      toast({ title: 'Referral update failed', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: nextFlagged ? 'Referral flagged' : 'Referral restored' });
    await load();
  };

  const removeReferral = async (row: ReferralRow) => {
    if (row.reward_applied_at) {
      toast({ title: 'Rewarded referrals cannot be deleted', description: 'Flag the record instead if it needs review.', variant: 'destructive' });
      return;
    }
    if (!confirm('Delete this referral record?')) return;

    setBusyId(row.id);
    const { error } = await supabase.from('referrals' as any).delete().eq('id', row.id);
    setBusyId(null);

    if (error) {
      toast({ title: 'Could not delete referral', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Referral removed' });
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Referrals</h1>
        <p className="text-sm text-muted-foreground">Monitor annual referral activity, slot usage, and suspicious signups across the platform.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="Annual Referral Accounts" value={summary.accounts} tone="text-primary" icon={<Gift className="h-4 w-4" />} />
        <SummaryCard label="Rewards This Cycle" value={summary.rewardedThisCycle} tone="text-emerald-500" icon={<CheckCircle2 className="h-4 w-4" />} />
        <SummaryCard label="Pending" value={summary.pending} tone="text-amber-500" icon={<Clock3 className="h-4 w-4" />} />
        <SummaryCard label="Flagged" value={summary.flagged} tone="text-orange-500" icon={<ShieldAlert className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Annual Referral Accounts</CardTitle>
          <p className="text-xs text-muted-foreground">Each annual business owner gets 3 referral slots per renewal cycle.</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading referral accounts...</p>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No annual referral accounts yet.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {accounts.map((account) => {
                const remaining = Math.max(REFERRAL_SLOT_LIMIT - Number(account.current_cycle_rewarded_count ?? 0), 0);
                return (
                  <div key={account.id} className="rounded-xl border border-border bg-muted/10 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{businessMap[account.business_id] ?? 'Business'}</p>
                        <p className="text-xs text-muted-foreground">Code: {account.referral_code}</p>
                      </div>
                      <Badge variant={remaining === 0 ? 'destructive' : 'secondary'}>{remaining} slots left</Badge>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <MiniMetric label="Used" value={`${account.current_cycle_rewarded_count}/${REFERRAL_SLOT_LIMIT}`} />
                      <MiniMetric label="Lifetime" value={`+${account.lifetime_rewarded_count} mo`} />
                      <MiniMetric label="Cycle ends" value={account.current_cycle_ends_at ? new Date(account.current_cycle_ends_at).toLocaleDateString('en-GH') : '—'} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Referral Activity</CardTitle>
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search business, email, phone..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as (typeof STATUS_FILTERS)[number])}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((status) => (
                  <SelectItem key={status} value={status}>{status === 'all' ? 'All statuses' : referralStatusLabel(status)}</SelectItem>
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
                  <th className="px-3 py-2">Referrer</th>
                  <th className="px-3 py-2">Referred</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Slots Left</th>
                  <th className="px-3 py-2">Notes</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const account = accountMap[row.referral_account_id];
                  const remaining = Math.max(REFERRAL_SLOT_LIMIT - Number(account?.current_cycle_rewarded_count ?? 0), 0);
                  const note = row.validation_reason
                    ? referralReasonLabel(row.validation_reason)
                    : row.reward_applied_at
                      ? `Rewarded ${formatDateTime(row.reward_applied_at)}`
                      : row.converted_at
                        ? `Paid ${formatDateTime(row.converted_at)}`
                        : 'Awaiting paid subscription';

                  return (
                    <tr key={row.id} className="border-b border-border/50 align-top">
                      <td className="px-3 py-3 text-[11px] text-muted-foreground">{formatDateTime(row.created_at)}</td>
                      <td className="px-3 py-3">
                        <div className="font-medium">{businessMap[row.referrer_business_id] ?? 'Unknown business'}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{account?.referral_code ?? '—'}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium">{row.referred_email || 'Unknown user'}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {row.referred_phone || 'No phone'}
                          {row.referred_business_id ? ` · ${businessMap[row.referred_business_id] ?? 'Business created'}` : ' · No business yet'}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-3 py-3 text-[11px] text-muted-foreground">{remaining}</td>
                      <td className="px-3 py-3 text-[11px] text-muted-foreground">
                        {note}
                        {row.subscribed_plan ? ` · ${row.subscribed_plan}` : ''}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === row.id}
                            onClick={() => void setFlagState(row, row.status !== 'flagged')}
                          >
                            {row.status === 'flagged' ? 'Restore' : 'Flag'}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            disabled={busyId === row.id}
                            onClick={() => void removeReferral(row)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">No referrals match the current filters.</td>
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

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const variant = normalized === 'rewarded'
    ? 'default'
    : normalized === 'pending'
      ? 'secondary'
      : normalized === 'flagged'
        ? 'destructive'
        : 'outline';

  return (
    <Badge
      variant={variant as 'default' | 'secondary' | 'outline' | 'destructive'}
      className={normalized === 'successful' ? 'border-emerald-500/30 text-emerald-600' : ''}
    >
      {referralStatusLabel(status)}
    </Badge>
  );
}
