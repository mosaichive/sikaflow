import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Building2, CheckCircle2, Copy, Globe, Pencil, Plus, Smartphone, Trash2 } from 'lucide-react';

type Kind = 'momo' | 'bank';
type Method = {
  id: string;
  kind: Kind;
  label: string;
  details: Record<string, string>;
  instructions: string | null;
  badge: string | null;
  active: boolean;
  sort_order: number;
};

type PaystackInfo = {
  configured: boolean;
  webhook_url?: string;
  supports_mobile_money?: boolean;
  supported_networks?: { code: string; label: string }[];
};

const KIND_META: Record<Kind, { title: string; icon: typeof Smartphone; desc: string }> = {
  momo: { title: 'Manual Mobile Money Fallback', icon: Smartphone, desc: 'Shown only when you want tenants to submit a manual MoMo reference.' },
  bank: { title: 'Bank Transfer', icon: Building2, desc: 'Manual bank-transfer fallback for subscription payments.' },
};

const FIELDS: Record<Kind, { key: string; label: string; placeholder?: string; full?: boolean }[]> = {
  momo: [
    { key: 'network', label: 'Network', placeholder: 'MTN / Telecel / AirtelTigo' },
    { key: 'account_name', label: 'Account name' },
    { key: 'number', label: 'MoMo number', placeholder: '024xxxxxxx' },
    { key: 'country', label: 'Country', placeholder: 'Ghana' },
  ],
  bank: [
    { key: 'bank_name', label: 'Bank name' },
    { key: 'account_name', label: 'Account name' },
    { key: 'account_number', label: 'Account number' },
    { key: 'branch', label: 'Branch' },
    { key: 'swift_code', label: 'SWIFT code (optional)' },
  ],
};

const empty = (kind: Kind): Partial<Method> => ({
  kind, label: '', details: {}, instructions: '', badge: '', active: true, sort_order: 0,
});

export default function PaymentMethodsPage() {
  const { toast } = useToast();
  const [methods, setMethods] = useState<Method[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Method> | null>(null);
  const [busy, setBusy] = useState(false);
  const [paystackInfo, setPaystackInfo] = useState<PaystackInfo | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('platform_payment_methods' as any)
      .select('*')
      .in('kind', ['momo', 'bank'])
      .order('kind')
      .order('sort_order')
      .order('created_at');
    if (error) toast({ title: 'Failed to load', description: error.message, variant: 'destructive' });
    setMethods((data as Method[]) ?? []);
    setLoading(false);
  }, [toast]);

  const checkPaystack = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('paystack-payment', { body: { action: 'status' } });
      if (error) {
        setPaystackInfo({ configured: false });
        return;
      }
      setPaystackInfo((data as PaystackInfo) ?? { configured: false });
    } catch {
      setPaystackInfo({ configured: false });
    }
  }, []);

  useEffect(() => { void load(); void checkPaystack(); }, [checkPaystack, load]);

  const save = async () => {
    if (!editing) return;
    if (!editing.label?.trim()) {
      toast({ title: 'Label required', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const payload = {
      kind: editing.kind!,
      label: editing.label.trim(),
      details: editing.details ?? {},
      instructions: editing.instructions ?? '',
      badge: editing.badge ?? '',
      active: editing.active ?? true,
      sort_order: Number(editing.sort_order ?? 0),
    };
    const { error } = editing.id
      ? await supabase.from('platform_payment_methods' as any).update(payload).eq('id', editing.id)
      : await supabase.from('platform_payment_methods' as any).insert(payload);
    setBusy(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: editing.id ? 'Updated' : 'Created' });
    setEditing(null);
    await load();
  };

  const toggle = async (method: Method) => {
    const { error } = await supabase
      .from('platform_payment_methods' as any)
      .update({ active: !method.active })
      .eq('id', method.id);
    if (error) {
      toast({ title: 'Failed', description: error.message, variant: 'destructive' });
      return;
    }
    await load();
  };

  const remove = async (method: Method) => {
    if (!confirm(`Delete "${method.label}"? This will hide it from tenant billing pages.`)) return;
    const { error } = await supabase.from('platform_payment_methods' as any).delete().eq('id', method.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Deleted' });
    await load();
  };

  const copy = (value: string) => {
    navigator.clipboard.writeText(value);
    toast({ title: 'Copied' });
  };

  const grouped: Record<Kind, Method[]> = { momo: [], bank: [] };
  methods.forEach((method) => grouped[method.kind].push(method));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Payment Methods</h1>
        <p className="text-sm text-muted-foreground">
          Configure the live subscription payment experience for every SikaFlow tenant.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Globe className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">Paystack Gateway</CardTitle>
              <p className="text-xs text-muted-foreground">
                Hosted checkout plus direct Ghana MoMo phone prompts through Paystack&apos;s Charge API.
              </p>
            </div>
          </div>
          {paystackInfo?.configured ? (
            <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Connected</Badge>
          ) : (
            <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Unavailable</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/20 p-4 text-xs text-muted-foreground">
            {paystackInfo?.configured ? (
              <div className="space-y-2">
                <p>Paystack is ready for live checkout, webhook confirmation, and direct mobile money prompts.</p>
                <p>
                  Supported Ghana MoMo networks:{' '}
                  <span className="text-foreground">
                    {(paystackInfo.supported_networks ?? []).map((network) => network.label).join(', ') || 'MTN, Telecel, AirtelTigo'}
                  </span>
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p>Paystack secret is missing or invalid, so tenants only see manual fallback methods.</p>
                <p>Add `PAYSTACK_SECRET_KEY` to Supabase Edge Function secrets to enable instant plan activation.</p>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Webhook URL</p>
                <p className="text-[11px] text-muted-foreground">Set this in Paystack so successful charges activate plans automatically.</p>
              </div>
              {paystackInfo?.webhook_url && (
                <Button variant="outline" size="sm" onClick={() => copy(paystackInfo.webhook_url!)}>
                  <Copy className="mr-2 h-3.5 w-3.5" /> Copy
                </Button>
              )}
            </div>
            <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-[11px] font-mono text-foreground break-all">
              {paystackInfo?.webhook_url || 'Available once the Paystack status check runs.'}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Paystack only guarantees webhooks for successful charges, so SikaFlow also polls and times out pending Ghana MoMo prompts safely.
            </p>
          </div>
        </CardContent>
      </Card>

      {(['momo', 'bank'] as Kind[]).map((kind) => {
        const meta = KIND_META[kind];
        const Icon = meta.icon;
        return (
          <Card key={kind}>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">{meta.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">{meta.desc}</p>
                </div>
              </div>
              <Button size="sm" onClick={() => setEditing(empty(kind))}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : grouped[kind].length === 0 ? (
                <p className="text-xs text-muted-foreground">No {meta.title.toLowerCase()} configured yet.</p>
              ) : (
                <div className="space-y-2">
                  {grouped[kind].map((method) => (
                    <div key={method.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{method.label}</p>
                          {method.badge && <Badge variant="outline" className="text-[10px]">{method.badge}</Badge>}
                          {!method.active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground space-x-2">
                          {Object.entries(method.details).filter(([, value]) => value).map(([key, value]) => (
                            <span key={key}>
                              <span className="opacity-60">{key}:</span> <span className="font-mono">{String(value)}</span>
                            </span>
                          ))}
                        </div>
                        {method.instructions && <p className="mt-1 text-[11px] text-muted-foreground">{method.instructions}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Switch checked={method.active} onCheckedChange={() => toggle(method)} />
                          <span className="text-[10px] text-muted-foreground">{method.active ? 'On' : 'Off'}</span>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(method)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(method)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit' : 'Add'} {editing ? KIND_META[editing.kind as Kind].title : ''}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Display label *</Label>
                <Input
                  value={editing.label ?? ''}
                  onChange={(event) => setEditing({ ...editing, label: event.target.value })}
                  placeholder={editing.kind === 'momo' ? 'MTN manual fallback' : 'GCB Main Account'}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {FIELDS[editing.kind as Kind].map((field) => (
                  <div key={field.key} className={field.full ? 'col-span-2' : ''}>
                    <Label className="text-xs">{field.label}</Label>
                    <Input
                      value={(editing.details as any)?.[field.key] ?? ''}
                      placeholder={field.placeholder}
                      onChange={(event) => setEditing({
                        ...editing,
                        details: { ...(editing.details ?? {}), [field.key]: event.target.value },
                      })}
                    />
                  </div>
                ))}
              </div>

              <div>
                <Label className="text-xs">Badge</Label>
                <Input
                  value={editing.badge ?? ''}
                  onChange={(event) => setEditing({ ...editing, badge: event.target.value })}
                  placeholder="Fallback / Preferred"
                />
              </div>

              <div>
                <Label className="text-xs">Instructions</Label>
                <Textarea
                  rows={3}
                  value={editing.instructions ?? ''}
                  onChange={(event) => setEditing({ ...editing, instructions: event.target.value })}
                  placeholder="Tell the tenant what to include or how to confirm the payment."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save method'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
