import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { useSubscription, PLAN_PRICES, PLAN_LABELS, STATUS_LABELS } from '@/context/SubscriptionContext';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  Globe,
  Loader2,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from 'lucide-react';

type PaymentMethod = {
  id: string;
  kind: 'momo' | 'bank' | 'paystack';
  label: string;
  details: Record<string, string>;
  instructions: string | null;
  badge: string | null;
  sort_order: number;
};

type PaymentRow = {
  id: string;
  plan: 'monthly' | 'annual';
  requested_plan?: 'monthly' | 'annual' | null;
  resolved_plan?: 'monthly' | 'annual' | null;
  amount_ghs: number;
  amount_paid_ghs?: number | null;
  method: string;
  status: string;
  reference: string | null;
  paystack_reference?: string | null;
  network?: string | null;
  review_reason?: string | null;
  gateway_status?: string | null;
  gateway_message?: string | null;
  expires_at?: string | null;
  created_at: string;
};

type PaystackStatus = {
  configured: boolean;
  webhook_url?: string;
  supports_mobile_money?: boolean;
  supported_networks?: { code: string; label: string }[];
};

type CheckoutState = {
  paymentId: string;
  reference: string;
  plan: 'monthly' | 'annual';
  phone: string;
  network: string;
  displayText: string;
  expiresAt: number;
};

const DEFAULT_NETWORKS = [
  { code: 'mtn', label: 'MTN MoMo' },
  { code: 'vod', label: 'Telecel Cash' },
  { code: 'atl', label: 'AirtelTigo Money' },
];

export default function BillingPage() {
  const { user } = useAuth();
  const { businessId, business } = useBusiness();
  const { subscription, hasAccess, daysRemaining, refresh } = useSubscription();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [paystackInfo, setPaystackInfo] = useState<PaystackStatus | null>(null);
  const [payOpen, setPayOpen] = useState<{ plan: 'monthly' | 'annual'; method: PaymentMethod } | null>(null);
  const [reference, setReference] = useState('');
  const [payerName, setPayerName] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [paystackBusy, setPaystackBusy] = useState<'monthly' | 'annual' | null>(null);
  const [momoBusy, setMomoBusy] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('monthly');
  const [momoPhone, setMomoPhone] = useState('');
  const [momoNetwork, setMomoNetwork] = useState('mtn');
  const [checkout, setCheckout] = useState<CheckoutState | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  const loadPayments = useCallback(async () => {
    if (!businessId) return;
    const { data } = await supabase
      .from('payments' as any)
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });
    setPayments((data as PaymentRow[]) ?? []);
  }, [businessId]);

  const loadMethods = useCallback(async () => {
    const { data } = await supabase
      .from('platform_payment_methods' as any)
      .select('*')
      .eq('active', true)
      .in('kind', ['momo', 'bank'])
      .order('kind')
      .order('sort_order')
      .order('created_at');
    setMethods((data as PaymentMethod[]) ?? []);
  }, []);

  const checkPaystack = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('paystack-payment', { body: { action: 'status' } });
      if (error) {
        setPaystackInfo({ configured: false });
        return;
      }
      setPaystackInfo((data as PaystackStatus) ?? { configured: false });
    } catch {
      setPaystackInfo({ configured: false });
    }
  }, []);

  useEffect(() => { void loadPayments(); }, [loadPayments]);
  useEffect(() => { void loadMethods(); void checkPaystack(); }, [checkPaystack, loadMethods]);

  useEffect(() => {
    if (!businessId) return;
    const channel = supabase.channel(`billing:${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `business_id=eq.${businessId}` }, () => {
        void loadPayments();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions', filter: `business_id=eq.${businessId}` }, () => {
        void refresh();
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [businessId, loadPayments, refresh]);

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
        toast({ title: 'Payment confirmed', description: 'Your subscription is active now.' });
      } else if ((data as any)?.status === 'review') {
        toast({ title: 'Payment needs review', description: 'We received the payment but flagged it for admin review.' });
      } else {
        toast({ title: 'Payment pending', description: 'We are still waiting for the final status from Paystack.' });
      }

      const next = new URLSearchParams(params);
      next.delete('reference');
      next.delete('trxref');
      setParams(next, { replace: true });
      await loadPayments();
      await refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!checkout) return;
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [checkout]);

  useEffect(() => {
    if (!checkout) return;

    let stopped = false;
    const poll = async (forceTimeout = false) => {
      const { data, error } = await supabase.functions.invoke('paystack-payment', {
        body: { action: 'check_charge', payment_id: checkout.paymentId, force_timeout: forceTimeout },
      });
      if (!stopped && (error || (data as any)?.error) && forceTimeout) {
        toast({
          title: 'Payment check failed',
          description: (data as any)?.error || error?.message || 'Please refresh billing history in a moment.',
          variant: 'destructive',
        });
      }
    };

    const interval = window.setInterval(() => {
      if (Date.now() >= checkout.expiresAt) {
        void poll(true);
        window.clearInterval(interval);
        return;
      }
      void poll(false);
    }, 9000);

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [checkout, toast]);

  const activeCheckoutPayment = checkout
    ? payments.find((payment) => payment.id === checkout.paymentId)
    : null;

  useEffect(() => {
    if (!checkout || !activeCheckoutPayment) return;
    if (['pending'].includes(activeCheckoutPayment.status)) return;

    if (activeCheckoutPayment.status === 'confirmed') {
      toast({ title: 'Payment confirmed', description: 'Your plan has been activated instantly.' });
    } else if (activeCheckoutPayment.status === 'review') {
      toast({ title: 'Payment under review', description: reviewCopy(activeCheckoutPayment.review_reason) });
    } else if (activeCheckoutPayment.status === 'timeout') {
      toast({ title: 'Payment timed out', description: 'The confirmation window expired. Please try again.', variant: 'destructive' });
    } else if (activeCheckoutPayment.status === 'failed' || activeCheckoutPayment.status === 'cancelled') {
      toast({
        title: activeCheckoutPayment.status === 'cancelled' ? 'Payment cancelled' : 'Payment failed',
        description: activeCheckoutPayment.gateway_message || 'Please try again or choose another method.',
        variant: 'destructive',
      });
    }

    setCheckout(null);
    void refresh();
  }, [activeCheckoutPayment, checkout, refresh, toast]);

  const submitPayment = async () => {
    if (!payOpen || !businessId || !user) return;
    if (!reference) {
      toast({ title: 'Reference required', description: 'Enter the transaction reference.', variant: 'destructive' });
      return;
    }

    setBusy(true);
    const amount = PLAN_PRICES[payOpen.plan];
    const { error } = await supabase.from('payments' as any).insert({
      business_id: businessId,
      plan: payOpen.plan,
      requested_plan: payOpen.plan,
      billing_cycle: payOpen.plan,
      amount_ghs: amount,
      method: payOpen.method.kind === 'momo' ? 'manual_momo' : 'bank_transfer',
      status: 'pending',
      reference,
      payer_name: payerName || (user.email ?? ''),
      payer_phone: payerPhone,
      note: `${payOpen.method.label}${note ? ` — ${note}` : ''}`,
      submitted_by: user.id,
      subscription_id: subscription?.id ?? null,
    });
    setBusy(false);
    if (error) {
      toast({ title: 'Failed', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Payment submitted', description: 'A super admin can now review and activate your plan.' });
    setPayOpen(null);
    setReference('');
    setNote('');
    setPayerName('');
    setPayerPhone('');
    await loadPayments();
    await refresh();
  };

  const startPaystack = async (plan: 'monthly' | 'annual') => {
    setPaystackBusy(plan);
    const callback_url = `${window.location.origin}/billing`;
    const { data, error } = await supabase.functions.invoke('paystack-payment', {
      body: { action: 'initialize', plan, callback_url },
    });
    setPaystackBusy(null);

    if (error || (data as any)?.error) {
      toast({
        title: 'Could not start Paystack',
        description: (data as any)?.error || error?.message || 'Please try again or use mobile money instead.',
        variant: 'destructive',
      });
      return;
    }
    window.location.href = (data as any).authorization_url;
  };

  const startMobileMoney = async () => {
    if (!paystackInfo?.configured) {
      toast({ title: 'Paystack is unavailable', description: 'Add or fix the Paystack secret first.', variant: 'destructive' });
      return;
    }
    if (!momoPhone.trim()) {
      toast({ title: 'Phone number required', description: 'Enter the mobile money number to charge.', variant: 'destructive' });
      return;
    }

    setMomoBusy(true);
    const { data, error } = await supabase.functions.invoke('paystack-payment', {
      body: {
        action: 'charge_mobile_money',
        plan: selectedPlan,
        phone: momoPhone,
        network: momoNetwork,
        payer_name: user?.email ?? undefined,
      },
    });
    setMomoBusy(false);

    if (error || (data as any)?.error) {
      toast({
        title: 'MoMo prompt failed',
        description: (data as any)?.error || error?.message || 'We could not trigger the mobile money prompt.',
        variant: 'destructive',
      });
      return;
    }

    const timeoutMs = Math.max(30, Number((data as any)?.timeout_seconds ?? 180)) * 1000;
    setCheckout({
      paymentId: (data as any).payment_id,
      reference: (data as any).reference,
      plan: selectedPlan,
      phone: momoPhone,
      network: momoNetwork,
      displayText: (data as any).display_text || 'Please confirm the prompt on your phone.',
      expiresAt: Date.now() + timeoutMs,
    });
    toast({ title: 'Prompt sent', description: (data as any).display_text || 'Please approve the payment on your phone.' });
    await loadPayments();
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied' });
  };

  const paystackReady = paystackInfo?.configured ?? null;
  const status = subscription?.status ?? 'trial';
  const showWarning = !hasAccess;
  const momoMethods = useMemo(() => methods.filter((method) => method.kind === 'momo'), [methods]);
  const bankMethods = useMemo(() => methods.filter((method) => method.kind === 'bank'), [methods]);
  const availableNetworks = paystackInfo?.supported_networks?.length ? paystackInfo.supported_networks : DEFAULT_NETWORKS;
  const secondsRemaining = checkout ? Math.max(0, Math.ceil((checkout.expiresAt - nowTick) / 1000)) : 0;

  return (
    <AppLayout>
      <div className="max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing & Subscription</h1>
          <p className="text-sm text-muted-foreground">{business?.name ?? 'Your business'} · plan, renewals, payments, and MoMo checkout.</p>
        </div>

        {showWarning && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
              <div>
                <p className="text-sm font-semibold text-destructive">Your subscription is {STATUS_LABELS[status]}.</p>
                <p className="text-xs text-muted-foreground">Renew below to restore full access for your team.</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4" /> Current Plan</CardTitle>
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
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <PlanCard
                title="Monthly"
                price="GH₵50"
                sub="per month"
                perks={['Full access', 'Cancel anytime', 'Renews every 30 days']}
                selected={selectedPlan === 'monthly'}
                onSelect={() => setSelectedPlan('monthly')}
                current={subscription?.plan === 'monthly' && subscription?.status === 'active'}
              />
              <PlanCard
                title="Annual"
                badge="Save GH₵100"
                price="GH₵500"
                sub="per year"
                perks={['Full access', '2 months free', 'Best value']}
                selected={selectedPlan === 'annual'}
                onSelect={() => setSelectedPlan('annual')}
                current={subscription?.plan === 'annual' && subscription?.status === 'active'}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payment Methods</CardTitle>
                <CardDescription>
                  Pay <span className="font-semibold text-foreground">GH₵{PLAN_PRICES[selectedPlan]}</span> for the {selectedPlan} plan. Mobile Money prompts confirm on the customer&apos;s phone directly.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <Section
                  icon={Smartphone}
                  title="Ghana Mobile Money"
                  description="Charge a phone number directly on MTN MoMo, Telecel Cash, or AirtelTigo Money through Paystack."
                >
                  {paystackReady === false ? (
                    <UnavailableMessage>
                      Paystack is not ready yet. Add the platform secret in Supabase to enable direct MoMo prompts.
                    </UnavailableMessage>
                  ) : (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                      <div className="grid gap-3 md:grid-cols-[1.1fr_1fr_auto]">
                        <div className="space-y-1">
                          <Label className="text-xs">Mobile money number</Label>
                          <Input
                            value={momoPhone}
                            onChange={(event) => setMomoPhone(event.target.value)}
                            placeholder="024xxxxxxx or +23324xxxxxxx"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Network</Label>
                          <Select value={momoNetwork} onValueChange={setMomoNetwork}>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose network" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableNetworks.map((network) => (
                                <SelectItem key={network.code} value={network.code}>{network.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end">
                          <Button className="w-full md:w-auto" onClick={startMobileMoney} disabled={momoBusy}>
                            {momoBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                            Pay GH₵{PLAN_PRICES[selectedPlan]}
                          </Button>
                        </div>
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        The exact amount determines the plan that gets activated. Mismatches, duplicates, underpayments, and overpayments are held for admin review automatically.
                      </p>
                    </div>
                  )}
                </Section>

                {checkout && (
                  <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">Waiting for phone confirmation</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">{checkout.displayText}</p>
                        </div>
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <Clock3 className="h-3 w-3" />
                          {secondsRemaining > 0 ? `${secondsRemaining}s left` : 'Checking final status'}
                        </Badge>
                      </div>
                      <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
                        <div><span className="text-foreground">Plan:</span> {PLAN_LABELS[checkout.plan]}</div>
                        <div><span className="text-foreground">Network:</span> {networkLabel(checkout.network, availableNetworks)}</div>
                        <div><span className="text-foreground">Phone:</span> {checkout.phone}</div>
                        <div><span className="text-foreground">Reference:</span> <span className="font-mono">{checkout.reference}</span></div>
                      </div>
                      {activeCheckoutPayment && (
                        <div className="rounded-md border border-border/60 bg-background/70 p-3 text-[11px]">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium text-foreground">Latest status</span>
                            <StatusBadge status={activeCheckoutPayment.status} />
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            {activeCheckoutPayment.gateway_message || statusCopy(activeCheckoutPayment.status)}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                <Section
                  icon={Globe}
                  title="Paystack Checkout"
                  description="Use Paystack&apos;s hosted checkout for cards, bank, or alternative online methods."
                >
                  {paystackReady === false ? (
                    <UnavailableMessage>
                      Paystack is temporarily unavailable. You can still submit manual Mobile Money or Bank Transfer records below.
                    </UnavailableMessage>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">Hosted Paystack checkout</p>
                          <Badge className="text-[10px]">Instant</Badge>
                          <Badge variant="outline" className="text-[10px]">Card / Bank</Badge>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Redirect securely to Paystack. Successful payments activate the plan automatically and update this page without a refresh.
                        </p>
                      </div>
                      <Button onClick={() => startPaystack(selectedPlan)} disabled={paystackBusy !== null || paystackReady === null}>
                        {paystackBusy === selectedPlan
                          ? 'Redirecting…'
                          : paystackReady === null
                            ? 'Checking…'
                            : `Pay GH₵${PLAN_PRICES[selectedPlan]} now`}
                      </Button>
                    </div>
                  )}
                </Section>

                {momoMethods.length > 0 && (
                  <Section
                    icon={Smartphone}
                    title="Manual Mobile Money Fallback"
                    description="Use this only when instant prompting is unavailable. Submit the transfer reference for admin review."
                  >
                    <div className="grid gap-2">
                      {momoMethods.map((method) => (
                        <MethodRow
                          key={method.id}
                          m={method}
                          amount={PLAN_PRICES[selectedPlan]}
                          onCopy={copy}
                          onPay={() => setPayOpen({ plan: selectedPlan, method })}
                        />
                      ))}
                    </div>
                  </Section>
                )}

                {bankMethods.length > 0 && (
                  <Section
                    icon={Building2}
                    title="Bank Transfer"
                    description="Transfer the exact amount and submit the reference for admin review."
                  >
                    <div className="grid gap-2">
                      {bankMethods.map((method) => (
                        <MethodRow
                          key={method.id}
                          m={method}
                          amount={PLAN_PRICES[selectedPlan]}
                          onCopy={copy}
                          onPay={() => setPayOpen({ plan: selectedPlan, method })}
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Receipt className="h-4 w-4" /> Payment History</CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No payments yet.</p>
            ) : (
              <div className="space-y-2">
                {payments.map((payment) => {
                  const paidAmount = Number(payment.amount_paid_ghs ?? payment.amount_ghs ?? 0);
                  const displayPlan = (payment.resolved_plan || payment.plan) as 'monthly' | 'annual';
                  return (
                    <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">
                            {PLAN_LABELS[displayPlan]} — GH₵{paidAmount.toLocaleString()}
                          </p>
                          {payment.requested_plan && payment.resolved_plan && payment.requested_plan !== payment.resolved_plan && (
                            <Badge variant="outline" className="text-[10px]">
                              Paid as {PLAN_LABELS[payment.resolved_plan]}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(payment.created_at).toLocaleString()} · {payment.method.replace(/_/g, ' ')} · ref {payment.reference || payment.paystack_reference || '—'}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {payment.network ? `${networkLabel(payment.network, availableNetworks)} · ` : ''}
                          {payment.expires_at ? `Expires ${new Date(payment.expires_at).toLocaleDateString()} · ` : ''}
                          {payment.review_reason ? reviewCopy(payment.review_reason) : payment.gateway_message || statusCopy(payment.status)}
                        </p>
                      </div>
                      <StatusBadge status={payment.status} />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!payOpen} onOpenChange={(open) => !open && setPayOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit payment for {payOpen ? PLAN_LABELS[payOpen.plan] : ''}</DialogTitle>
            <DialogDescription>
              {payOpen && `Sent GH₵${PLAN_PRICES[payOpen.plan]} via ${payOpen.method.label}? Submit the reference here so a super admin can verify it.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Transaction reference *</Label>
              <Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="e.g. MM240417xxxxx" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Payer name</Label>
                <Input value={payerName} onChange={(event) => setPayerName(event.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Payer phone</Label>
                <Input value={payerPhone} onChange={(event) => setPayerPhone(event.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Note</Label>
              <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
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

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Smartphone;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
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

function UnavailableMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
      <span>{children}</span>
    </div>
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
      className={cn('text-[10px]', normalized === 'review' && 'border-amber-500/40 text-amber-600')}
    >
      {normalized === 'confirmed' && <CheckCircle2 className="mr-1 h-3 w-3" />}
      {normalized === 'pending' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
      {normalized}
    </Badge>
  );
}

function MethodRow({
  m,
  amount,
  onCopy,
  onPay,
}: {
  m: PaymentMethod;
  amount: number;
  onCopy: (text: string) => void;
  onPay: () => void;
}) {
  const fields = Object.entries(m.details).filter(([, value]) => value);
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">{m.label}</p>
          {m.badge && <Badge variant="outline" className="text-[10px]">{m.badge}</Badge>}
        </div>
        <div className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
          {fields.map(([key, value]) => (
            <div key={key} className="flex items-center gap-1 text-[11px]">
              <span className="capitalize text-muted-foreground">{key.replace(/_/g, ' ')}:</span>
              <span className="font-mono">{String(value)}</span>
              <button onClick={() => onCopy(String(value))} className="opacity-60 transition hover:opacity-100">
                <Copy className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        {m.instructions && <p className="mt-2 text-[11px] text-muted-foreground">{m.instructions}</p>}
      </div>
      <Button size="sm" onClick={onPay}>I&apos;ve paid GH₵{amount}</Button>
    </div>
  );
}

function PlanCard({
  title,
  price,
  sub,
  perks,
  selected,
  onSelect,
  current,
  badge,
}: {
  title: string;
  price: string;
  sub: string;
  perks: string[];
  selected?: boolean;
  onSelect?: () => void;
  current?: boolean;
  badge?: string;
}) {
  return (
    <Card
      className={cn('cursor-pointer transition-all', selected ? 'border-primary ring-2 ring-primary/30' : current ? 'border-primary' : '')}
      onClick={onSelect}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex items-center gap-1">
            {current && <Badge variant="secondary" className="text-[10px]">Current</Badge>}
            {badge && <Badge variant="default" className="flex items-center gap-1 text-[10px]"><Sparkles className="h-2.5 w-2.5" />{badge}</Badge>}
          </div>
        </div>
        <CardDescription>
          <span className="text-2xl font-bold text-foreground">{price}</span> <span className="text-xs">{sub}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1 text-xs text-muted-foreground">
          {perks.map((perk) => <li key={perk}>• {perk}</li>)}
        </ul>
      </CardContent>
    </Card>
  );
}

function networkLabel(code: string | null | undefined, networks: { code: string; label: string }[]) {
  if (!code) return 'Unknown network';
  return networks.find((network) => network.code === code)?.label || code.toUpperCase();
}

function statusCopy(status: string) {
  switch (status) {
    case 'pending':
      return 'Waiting for customer confirmation.';
    case 'confirmed':
      return 'Payment verified and subscription activated.';
    case 'failed':
      return 'Payment failed before activation.';
    case 'cancelled':
      return 'Payment was cancelled before completion.';
    case 'timeout':
      return 'Customer did not confirm in time.';
    case 'review':
      return 'Payment is waiting for admin review.';
    case 'rejected':
      return 'Payment was rejected by admin.';
    default:
      return status;
  }
}

function reviewCopy(reason?: string | null) {
  switch (reason) {
    case 'underpaid':
      return 'The amount paid was lower than any valid plan price.';
    case 'overpaid':
      return 'The amount paid was higher than a valid plan price and needs review.';
    case 'amount_mismatch':
      return 'The amount paid does not match a valid subscription price.';
    case 'duplicate_payment':
      return 'A duplicate transaction was detected and held for review.';
    default:
      return 'This payment needs admin review before activation.';
  }
}
