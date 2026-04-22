import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Row = {
  id: string;
  business_id: string;
  plan: string;
  status: string;
  price_ghs: number;
  trial_end_date: string | null;
  current_period_end: string | null;
  next_renewal_date: string | null;
  businesses: { name: string; email: string | null } | null;
};

export default function SubscriptionsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [planChange, setPlanChange] = useState<{ id: string; business_id: string; name: string } | null>(null);
  const [newPlan, setNewPlan] = useState<'free_trial' | 'monthly' | 'annual' | 'lifetime'>('monthly');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from('subscriptions' as any)
      .select('*,businesses(name,email)')
      .order('updated_at', { ascending: false });
    setRows((data as any) ?? []);
  };
  useEffect(() => { void load(); }, []);

  const setPlan = async () => {
    if (!planChange) return;
    setBusy(true);
    const { error, data } = await supabase.functions.invoke('manage-subscription', {
      body: { action: 'set_plan', business_id: planChange.business_id, plan: newPlan },
    });
    setBusy(false);
    if (error || (data as any)?.error) return toast({ title: 'Failed', description: error?.message, variant: 'destructive' });
    toast({ title: 'Plan updated' });
    setPlanChange(null);
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
        <p className="text-sm text-muted-foreground">Every active and past subscription on the platform.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2">Business</th>
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Renews</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const renew = r.trial_end_date ?? r.current_period_end ?? r.next_renewal_date;
                  return (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.businesses?.name ?? '—'}</div>
                        <div className="text-[10px] text-muted-foreground">{r.businesses?.email}</div>
                      </td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{r.plan}</Badge></td>
                      <td className="px-3 py-2"><Badge className="text-[10px]" variant={r.status === 'active' || r.status === 'lifetime' ? 'default' : r.status === 'trial' ? 'secondary' : 'destructive'}>{r.status}</Badge></td>
                      <td className="px-3 py-2">GH₵{Number(r.price_ghs).toLocaleString()}</td>
                      <td className="px-3 py-2 text-[11px] text-muted-foreground">{renew ? new Date(renew).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => { setPlanChange({ id: r.id, business_id: r.business_id, name: r.businesses?.name ?? '' }); setNewPlan(r.plan as any); }}>
                          Change Plan
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!planChange} onOpenChange={(o) => !o && setPlanChange(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change plan — {planChange?.name}</DialogTitle>
          </DialogHeader>
          <Select value={newPlan} onValueChange={(v) => setNewPlan(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="free_trial">Free Trial (30 days)</SelectItem>
              <SelectItem value="monthly">Monthly — GH₵50</SelectItem>
              <SelectItem value="annual">Annual — GH₵500</SelectItem>
              <SelectItem value="lifetime">Lifetime (free)</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPlanChange(null)}>Cancel</Button>
            <Button onClick={setPlan} disabled={busy}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
