import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

type Row = {
  id: string; business_id: string; plan: string; amount_ghs: number; method: string;
  status: string; reference: string | null; payer_name: string | null; payer_phone: string | null;
  payment_date: string; note: string | null;
  businesses: { name: string } | null;
};

export default function PaymentsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from('payments' as any)
      .select('*,businesses(name)')
      .order('created_at', { ascending: false });
    setRows((data as any) ?? []);
  };
  useEffect(() => { void load(); }, []);

  const act = async (id: string, action: 'confirm_payment' | 'reject_payment') => {
    setBusy(true);
    const { error } = await supabase.functions.invoke('manage-subscription', { body: { action, payment_id: id } });
    setBusy(false);
    if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    toast({ title: action === 'confirm_payment' ? 'Payment confirmed' : 'Payment rejected' });
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">Manual MoMo/bank transfers. Confirming a payment activates the matching plan.</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Business</th>
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="px-3 py-2 text-[11px] text-muted-foreground">{new Date(r.payment_date).toLocaleString()}</td>
                    <td className="px-3 py-2">{r.businesses?.name ?? '—'}</td>
                    <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{r.plan}</Badge></td>
                    <td className="px-3 py-2 font-semibold">GH₵{Number(r.amount_ghs).toLocaleString()}</td>
                    <td className="px-3 py-2 text-[11px]">{r.method}</td>
                    <td className="px-3 py-2 text-[11px] font-mono">{r.reference || '—'}</td>
                    <td className="px-3 py-2">
                      <Badge className="text-[10px]" variant={r.status === 'confirmed' ? 'default' : r.status === 'pending' ? 'secondary' : 'destructive'}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.status === 'pending' && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="default" disabled={busy} onClick={() => act(r.id, 'confirm_payment')}>Confirm</Button>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(r.id, 'reject_payment')}>Reject</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-sm text-muted-foreground">No payments yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
