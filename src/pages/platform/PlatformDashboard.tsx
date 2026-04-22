import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Sparkles, CheckCircle2, AlertCircle, XCircle, Banknote, Calendar, Clock } from 'lucide-react';

interface Stat { label: string; value: number | string; icon: any; tone: string; }

export default function PlatformDashboard() {
  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [biz, subs, pays] = await Promise.all([
        supabase.from('businesses' as any).select('id,status,email_verified,phone_verified'),
        supabase.from('subscriptions' as any).select('plan,status,price_ghs'),
        supabase.from('payments' as any).select('amount_ghs,status,confirmed_at,plan'),
      ]);
      const businesses = (biz.data as any[]) ?? [];
      const subscriptions = (subs.data as any[]) ?? [];
      const payments = (pays.data as any[]) ?? [];

      const totalRevenue = payments
        .filter((p) => p.status === 'confirmed')
        .reduce((s, p) => s + Number(p.amount_ghs ?? 0), 0);

      const expectedThisMonth = subscriptions
        .filter((s) => s.status === 'active')
        .reduce((s, sub) => s + Number(sub.price_ghs ?? 0), 0);

      setStats([
        { label: 'Total Businesses', value: businesses.length, icon: Building2, tone: 'text-blue-500' },
        { label: 'Active Trials', value: subscriptions.filter((s) => s.status === 'trial').length, icon: Sparkles, tone: 'text-amber-500' },
        { label: 'Active Monthly', value: subscriptions.filter((s) => s.status === 'active' && s.plan === 'monthly').length, icon: CheckCircle2, tone: 'text-emerald-500' },
        { label: 'Active Annual', value: subscriptions.filter((s) => s.status === 'active' && s.plan === 'annual').length, icon: CheckCircle2, tone: 'text-emerald-600' },
        { label: 'Lifetime', value: subscriptions.filter((s) => s.status === 'lifetime').length, icon: CheckCircle2, tone: 'text-purple-500' },
        { label: 'Expired', value: subscriptions.filter((s) => s.status === 'expired').length, icon: AlertCircle, tone: 'text-orange-500' },
        { label: 'Suspended', value: subscriptions.filter((s) => s.status === 'suspended').length, icon: XCircle, tone: 'text-red-500' },
        { label: 'Verification Pending', value: businesses.filter((b) => !b.email_verified || !b.phone_verified).length, icon: Clock, tone: 'text-yellow-500' },
        { label: 'Total Revenue', value: `GH₵${totalRevenue.toLocaleString()}`, icon: Banknote, tone: 'text-emerald-600' },
        { label: 'Expected this Month', value: `GH₵${expectedThisMonth.toLocaleString()}`, icon: Calendar, tone: 'text-blue-600' },
      ]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Overview</h1>
        <p className="text-sm text-muted-foreground">High-level health of every business on SikaFlow.</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading metrics...</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <s.icon className={`h-3.5 w-3.5 ${s.tone}`} /> {s.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
