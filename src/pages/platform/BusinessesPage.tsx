import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Search, Pause, Play, Trash2, Mail, RotateCcw, Calendar, ShieldOff } from 'lucide-react';

type Row = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  status: string;
  email_verified: boolean;
  phone_verified: boolean;
  number_of_employees: number | null;
  subscriptions: { plan: string; status: string; trial_end_date: string | null; current_period_end: string | null }[] | null;
};

export default function BusinessesPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [verifyFilter, setVerifyFilter] = useState('all');
  const [busy, setBusy] = useState(false);

  // Action dialogs
  const [extendOpen, setExtendOpen] = useState<{ id: string; name: string } | null>(null);
  const [extendDays, setExtendDays] = useState(7);
  const [deleteOpen, setDeleteOpen] = useState<{ id: string; name: string } | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from('businesses' as any)
      .select('id,name,email,phone,location,status,email_verified,phone_verified,number_of_employees,subscriptions(plan,status,trial_end_date,current_period_end)')
      .order('name');
    setRows((data as any) ?? []);
  };

  useEffect(() => { void load(); }, []);

  const callAction = async (body: Record<string, unknown>, successMsg: string) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('manage-subscription', { body });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast({ title: 'Action failed', description: error?.message ?? (data as any)?.error, variant: 'destructive' });
      return false;
    }
    toast({ title: successMsg });
    await load();
    return true;
  };

  const filtered = rows.filter((r) => {
    const sub = r.subscriptions?.[0];
    if (search && !r.name.toLowerCase().includes(search.toLowerCase()) && !r.email?.toLowerCase().includes(search.toLowerCase())) return false;
    if (planFilter !== 'all' && sub?.plan !== planFilter) return false;
    if (statusFilter !== 'all' && sub?.status !== statusFilter) return false;
    if (verifyFilter === 'pending' && r.email_verified && r.phone_verified) return false;
    if (verifyFilter === 'verified' && (!r.email_verified || !r.phone_verified)) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Businesses</h1>
          <p className="text-sm text-muted-foreground">Manage every tenant on the platform. Internal business data stays private.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-3 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search name or email..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger><SelectValue placeholder="Plan" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="free_trial">Free Trial</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="lifetime">Lifetime</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="lifetime">Lifetime</SelectItem>
              </SelectContent>
            </Select>
            <Select value={verifyFilter} onValueChange={setVerifyFilter}>
              <SelectTrigger><SelectValue placeholder="Verification" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="verified">Fully Verified</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2">Business</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Renews</th>
                  <th className="px-3 py-2">Verified</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const sub = r.subscriptions?.[0];
                  const renew = sub?.trial_end_date ?? sub?.current_period_end;
                  return (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-[10px] text-muted-foreground">{r.location || '—'} · {r.number_of_employees ?? 0} staff</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-[11px]">{r.email}</div>
                        <div className="text-[10px] text-muted-foreground">{r.phone}</div>
                      </td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{sub?.plan ?? '—'}</Badge></td>
                      <td className="px-3 py-2"><Badge className="text-[10px]" variant={sub?.status === 'active' || sub?.status === 'lifetime' ? 'default' : sub?.status === 'trial' ? 'secondary' : 'destructive'}>{sub?.status ?? '—'}</Badge></td>
                      <td className="px-3 py-2 text-[11px] text-muted-foreground">{renew ? new Date(renew).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <Badge variant={r.email_verified ? 'default' : 'outline'} className="text-[9px]">@</Badge>
                          <Badge variant={r.phone_verified ? 'default' : 'outline'} className="text-[9px]">📱</Badge>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" title="Extend Trial" onClick={() => setExtendOpen({ id: r.id, name: r.name })}>
                            <Calendar className="h-3.5 w-3.5" />
                          </Button>
                          {sub?.status === 'suspended' ? (
                            <Button size="sm" variant="ghost" title="Reactivate" disabled={busy} onClick={() => callAction({ action: 'reactivate', business_id: r.id }, 'Reactivated')}>
                              <Play className="h-3.5 w-3.5 text-emerald-500" />
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" title="Suspend" disabled={busy} onClick={() => callAction({ action: 'suspend', business_id: r.id }, 'Suspended')}>
                              <Pause className="h-3.5 w-3.5 text-amber-500" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" title="Reset Verification" disabled={busy} onClick={() => callAction({ action: 'reset_verification', business_id: r.id }, 'Verification reset')}>
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" title="Delete" onClick={() => setDeleteOpen({ id: r.id, name: r.name })}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-sm text-muted-foreground py-10">No businesses match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Extend trial dialog */}
      <Dialog open={!!extendOpen} onOpenChange={(o) => !o && setExtendOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend trial for {extendOpen?.name}</DialogTitle>
            <DialogDescription>Add days to the current trial. The business will keep full access during the extended window.</DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Days to add</Label>
            <Input type="number" min={1} max={365} value={extendDays} onChange={(e) => setExtendDays(Number(e.target.value))} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExtendOpen(null)}>Cancel</Button>
            <Button disabled={busy} onClick={async () => {
              if (!extendOpen) return;
              const ok = await callAction({ action: 'extend_trial', business_id: extendOpen.id, days: extendDays }, 'Trial extended');
              if (ok) setExtendOpen(null);
            }}>Extend</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteOpen} onOpenChange={(o) => !o && setDeleteOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldOff className="h-4 w-4 text-destructive" /> Delete {deleteOpen?.name}?</DialogTitle>
            <DialogDescription>This permanently removes the business and all of its data. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(null)}>Cancel</Button>
            <Button variant="destructive" disabled={busy} onClick={async () => {
              if (!deleteOpen) return;
              const ok = await callAction({ action: 'delete_business', business_id: deleteOpen.id }, 'Business deleted');
              if (ok) setDeleteOpen(null);
            }}>Yes, delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
