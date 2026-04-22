import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { useSubscription, PLAN_PRICES, PLAN_LABELS, STATUS_LABELS } from '@/context/SubscriptionContext';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, Sparkles, CheckCircle2, AlertTriangle, Receipt, Smartphone, Building2, Globe, Copy } from 'lucide-react';

type PaymentMethod = {
  id: string;
  kind: 'momo' | 'bank' | 'paystack';
  label: string;
  details: Record<string, string>;
  instructions: string | null;
  badge: string | null;
  sort_order: number;
};

export default function BillingPage() {
  const { user } = useAuth();
  const { businessId, business } = useBusiness();
  const { subscription, hasAccess, daysRemaining, refresh } = useSubscription();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();

  const [payments, setPayments] = useState<any[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [paystackReady, setPaystackReady] = useState<boolean | null>(null);
  const [payOpen, setPayOpen] = useState<{ plan: 'monthly' | 'annual'; method: PaymentMethod } | null>(null);
  const [reference, setReference] = useState('');
  const [payerName, setPayerName] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [paystackBusy, setPaystackBusy] = useState<'monthly' | 'annual' | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('monthly');

  const loadPayments = async () => {
    if (!businessId) return;
    const { data } = await supabase.from('payments' as any).select('*').eq('business_id', businessId).order('created_at', { ascending: false });
    setPayments((data as any) ?? []);
  };
  const loadMethods = async () => {
    const { data } = await supabase
      .from('platform_payment_methods' as any)
      .select('*')
      .eq('active', true)
      .in('kind', ['momo', 'bank'])
      .order('kind').order('sort_order').order('created_at');
    setMethods((data as any) ?? []);
  };
  const checkPaystack = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('paystack-payment', { body: { action: 'status' } });
      if (error) { setPaystackReady(false); return; }
      setPaystackReady(!!(data as any)?.configured);
    } catch { setPaystackReady(false); }
  };

  useEffect(() => { void loadPayments(); }, [businessId]);
  useEffect(() => { void loadMethods(); void checkPaystack(); }, []);

  // Verify Paystack callback (?reference=...)
  useEffect(() => {
    const ref = params.get('reference') || params.get('trxref');
    if (!ref) return;
    (async () => {
      const { data, error } = await supabase.functions.invoke('paystack-payment', {
        body: { action: 'verify', reference: ref },
      });
      if (error || (data as any)?.error) {
        toast({ title: 'Verification failed', description: (data as any)?.error || error?.message, variant: 'destructive' });
      } else if ((data as any)?.status === 'confirmed') {
        toast({ title: 'Payment confirmed', description: 'Your subscription is now active.' });
      } else {
        toast({ title: 'Payment pending', description: 'We will update your status shortly.' });
      }
      params.delete('reference'); params.delete('trxref');
      setParams(params, { replace: true });
      await loadPayments();
      await refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitPayment = async () => {
    if (!payOpen || !businessId || !user) return;
    if (!reference) return toast({ title: 'Reference required', description: 'Enter the transaction reference.', variant: 'destructive' });
    setBusy(true);
    const amount = PLAN_PRICES[payOpen.plan];
    const { error } = await supabase.from('payments' as any).insert({
      business_id: businessId, plan: payOpen.plan, amount_ghs: amount,
      method: payOpen.method.kind === 'momo' ? 'manual_momo' : 'bank_transfer',
      status: 'pending', reference,
      payer_name: payerName || (user.email ?? ''), payer_phone: payerPhone,
      note: `${payOpen.method.label}${note ? ' — ' + note : ''}`,
      submitted_by: user.id, subscription_id: subscription?.id ?? null,
    });
    setBusy(false);
    if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Payment submitted', description: 'Super Admin will confirm and activate your plan within 24 hours.' });
    setPayOpen(null); setReference(''); setNote(''); setPayerName(''); setPayerPhone('');
    await loadPayments(); await refresh();
  };

  const startPaystack = async (plan: 'monthly' | 'annual') => {
    setPaystackBusy(plan);
    const callback_url = `${window.location.origin}/billing`;
    const { data, error } = await supabase.functions.invoke('paystack-payment', {
      body: { action: 'initialize', plan, callback_url },
    });
    setPaystackBusy(null);
    if (error || (data as any)?.error) {
      return toast({
        title: 'Could not start Paystack',
        description: (data as any)?.error || error?.message || 'Please try again or use a manual method.',
        variant: 'destructive',
      });
    }
    window.location.href = (data as any).authorization_url;
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied' });
  };

  const status = subscription?.status ?? 'trial';
  const showWarning = !hasAccess;
  const momoMethods = useMemo(() => methods.filter((m) => m.kind === 'momo'), [methods]);
  const bankMethods = useMemo(() => methods.filter((m) => m.kind === 'bank'), [methods]);

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing & Subscription</h1>
          <p className="text-sm text-muted-foreground">{business?.name ?? 'Your business'} · plan, renewals and payment history.</p>
        </div>

        {showWarning && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-destructive">Your subscription is {STATUS_LABELS[status]}.</p>
                <p className="text-xs text-muted-foreground">Renew below to restore full access for your team.</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" /> Current Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-3">
              <p className="text-2xl font-bold">{PLAN_LABELS[subscription?.plan ?? 'free_trial']}</p>
              <Badge variant={status === 'active' || status === 'lifetime' ? 'default' : status === 'trial' ? 'secondary' : 'destructive'}>
                {STATUS_LABELS[status]}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {subscription?.status === 'lifetime' && 'Lifetime free access — thank you for being an early customer.'}
              {subscription?.status === 'trial' && daysRemaining !== null && `${daysRemaining} days left in your free trial.`}
              {subscription?.status === 'active' && subscription.current_period_end && `Renews on ${new Date(subscription.current_period_end).toLocaleDateString()}.`}
            </p>
          </CardContent>
        </Card>

        {subscription?.status !== 'lifetime' && (
          <>
            {/* Plans */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <PlanCard
                title="Monthly" price="GH₵50" sub="per month"
                perks={['Full access', 'Cancel anytime', 'Renews every 30 days']}
                selected={selectedPlan === 'monthly'} onSelect={() => setSelectedPlan('monthly')}
                current={subscription?.plan === 'monthly' && subscription?.status === 'active'}
              />
              <PlanCard
                title="Annual" badge="Save GH₵100" price="GH₵500" sub="per year"
                perks={['Full access', '2 months free', 'Best value']}
                selected={selectedPlan === 'annual'} onSelect={() => setSelectedPlan('annual')}
                current={subscription?.plan === 'annual' && subscription?.status === 'active'}
              />
            </div>

            {/* Payment methods */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payment Methods</CardTitle>
                <CardDescription>
                  Pay <span className="font-semibold text-foreground">GH₵{PLAN_PRICES[selectedPlan]}</span> for the {selectedPlan} plan using any of the methods below.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Paystack — platform-wide built-in instant online payment */}
                <Section
                  icon={Globe}
                  title="Instant Online Payment"
                  description="Pay instantly with card, MoMo or bank via Paystack. Your subscription activates automatically."
                >
                  {paystackReady === false ? (
                    <div className="border border-dashed border-border rounded-lg p-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      Paystack is temporarily unavailable. Please use Mobile Money or Bank Transfer below.
                    </div>
                  ) : (
                    <div className="border border-primary/30 bg-primary/5 rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">Pay with Paystack</p>
                          <Badge className="text-[10px]">Instant</Badge>
                          <Badge variant="outline" className="text-[10px]">Recommended</Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Card · Mobile Money · Bank — secure checkout, instant subscription activation.
                        </p>
                      </div>
                      <Button
                        onClick={() => startPaystack(selectedPlan)}
                        disabled={paystackBusy !== null || paystackReady === null}
                      >
                        {paystackBusy === selectedPlan
                          ? 'Redirecting…'
                          : paystackReady === null
                            ? 'Checking…'
                            : `Pay GH₵${PLAN_PRICES[selectedPlan]} now`}
                      </Button>
                    </div>
                  )}
                </Section>

                {/* MoMo */}
                {momoMethods.length > 0 && (
                  <Section icon={Smartphone} title="Mobile Money" description="Send the exact amount, then submit the reference for confirmation.">
                    <div className="grid gap-2">
                      {momoMethods.map((m) => (
                        <MethodRow key={m.id} m={m} amount={PLAN_PRICES[selectedPlan]}
                          onCopy={copy}
                          onPay={() => setPayOpen({ plan: selectedPlan, method: m })}
                        />
                      ))}
                    </div>
                  </Section>
                )}

                {/* Bank */}
                {bankMethods.length > 0 && (
                  <Section icon={Building2} title="Bank Transfer" description="Transfer the exact amount to one of these accounts.">
                    <div className="grid gap-2">
                      {bankMethods.map((m) => (
                        <MethodRow key={m.id} m={m} amount={PLAN_PRICES[selectedPlan]}
                          onCopy={copy}
                          onPay={() => setPayOpen({ plan: selectedPlan, method: m })}
                        />
                      ))}
                    </div>
                  </Section>
                )}

                {methods.length === 0 && paystackReady === false && (
                  <p className="text-xs text-muted-foreground">
                    No payment methods are available right now. Please contact support.
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* History */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4" /> Payment History</CardTitle></CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No payments yet.</p>
            ) : (
              <div className="space-y-2">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between border border-border rounded-lg p-3">
                    <div>
                      <p className="text-sm font-medium">{PLAN_LABELS[p.plan as 'monthly' | 'annual']} — GH₵{Number(p.amount_ghs).toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(p.created_at).toLocaleString()} · {p.method} · ref {p.reference || p.paystack_reference || '—'}
                      </p>
                    </div>
                    <Badge variant={p.status === 'confirmed' ? 'default' : p.status === 'pending' ? 'secondary' : 'destructive'}>
                      {p.status === 'confirmed' && <CheckCircle2 className="h-3 w-3 mr-1" />} {p.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Manual payment dialog */}
      <Dialog open={!!payOpen} onOpenChange={(o) => !o && setPayOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit payment for {payOpen ? PLAN_LABELS[payOpen.plan] : ''}</DialogTitle>
            <DialogDescription>
              {payOpen && `Sent GH₵${PLAN_PRICES[payOpen.plan]} via ${payOpen.method.label}? Submit the reference here. Super Admin confirms within 24 hours.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Transaction reference *</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. MM240417xxxxx" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Payer name</Label><Input value={payerName} onChange={(e) => setPayerName(e.target.value)} /></div>
              <div><Label className="text-xs">Payer phone</Label><Input value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} /></div>
            </div>
            <div><Label className="text-xs">Note</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayOpen(null)}>Cancel</Button>
            <Button disabled={busy} onClick={submitPayment}>{busy ? 'Submitting...' : 'Submit Payment'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function Section({ icon: Icon, title, description, children }: { icon: typeof Smartphone; title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function MethodRow({ m, amount, onCopy, onPay }: {
  m: PaymentMethod; amount: number; onCopy: (s: string) => void; onPay: () => void;
}) {
  const fields = Object.entries(m.details).filter(([, v]) => v);
  return (
    <div className="border border-border rounded-lg p-3 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold">{m.label}</p>
          {m.badge && <Badge variant="outline" className="text-[10px]">{m.badge}</Badge>}
        </div>
        <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
          {fields.map(([k, v]) => (
            <div key={k} className="flex items-center gap-1 text-[11px]">
              <span className="text-muted-foreground capitalize">{k.replace(/_/g, ' ')}:</span>
              <span className="font-mono">{String(v)}</span>
              <button onClick={() => onCopy(String(v))} className="opacity-60 hover:opacity-100">
                <Copy className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        {m.instructions && <p className="text-[11px] text-muted-foreground mt-2">{m.instructions}</p>}
      </div>
      <Button size="sm" onClick={onPay}>I&apos;ve paid GH₵{amount}</Button>
    </div>
  );
}

function PlanCard({ title, price, sub, perks, selected, onSelect, current, badge }: {
  title: string; price: string; sub: string; perks: string[];
  selected?: boolean; onSelect?: () => void; current?: boolean; badge?: string;
}) {
  return (
    <Card
      className={`cursor-pointer transition-all ${selected ? 'border-primary ring-2 ring-primary/30' : current ? 'border-primary' : ''}`}
      onClick={onSelect}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex items-center gap-1">
            {current && <Badge variant="secondary" className="text-[10px]">Current</Badge>}
            {badge && <Badge variant="default" className="text-[10px] flex items-center gap-1"><Sparkles className="h-2.5 w-2.5" />{badge}</Badge>}
          </div>
        </div>
        <CardDescription>
          <span className="text-2xl font-bold text-foreground">{price}</span> <span className="text-xs">{sub}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="text-xs text-muted-foreground space-y-1">
          {perks.map((p) => <li key={p}>• {p}</li>)}
        </ul>
      </CardContent>
    </Card>
  );
}
