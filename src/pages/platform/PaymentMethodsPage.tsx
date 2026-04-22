import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Smartphone, Building2, Globe, Plus, Pencil, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';

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

const KIND_META: Record<Kind, { title: string; icon: typeof Smartphone; desc: string }> = {
  momo: { title: 'Mobile Money', icon: Smartphone, desc: 'MTN, Telecel, AirtelTigo' },
  bank: { title: 'Bank Transfer', icon: Building2, desc: 'Direct bank deposits' },
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
  const [paystackStatus, setPaystackStatus] = useState<'checking' | 'connected' | 'error'>('checking');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('platform_payment_methods' as any)
      .select('*')
      .in('kind', ['momo', 'bank'])
      .order('kind').order('sort_order').order('created_at');
    if (error) toast({ title: 'Failed to load', description: error.message, variant: 'destructive' });
    setMethods((data as any) ?? []);
    setLoading(false);
  };
  const checkPaystack = async () => {
    setPaystackStatus('checking');
    try {
      const { data, error } = await supabase.functions.invoke('paystack-payment', { body: { action: 'status' } });
      if (error) return setPaystackStatus('error');
      setPaystackStatus((data as any)?.configured ? 'connected' : 'error');
    } catch { setPaystackStatus('error'); }
  };
  useEffect(() => { void load(); void checkPaystack(); }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.label?.trim()) return toast({ title: 'Label required', variant: 'destructive' });
    setBusy(true);
    const payload = {
      kind: editing.kind!,
      label: editing.label!.trim(),
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
    if (error) return toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    toast({ title: editing.id ? 'Updated' : 'Created' });
    setEditing(null);
    await load();
  };

  const toggle = async (m: Method) => {
    const { error } = await supabase.from('platform_payment_methods' as any)
      .update({ active: !m.active }).eq('id', m.id);
    if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    await load();
  };

  const remove = async (m: Method) => {
    if (!confirm(`Delete "${m.label}"? This will hide it from all tenant billing pages.`)) return;
    const { error } = await supabase.from('platform_payment_methods' as any).delete().eq('id', m.id);
    if (error) return toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Deleted' });
    await load();
  };

  const grouped: Record<Kind, Method[]> = { momo: [], bank: [] };
  methods.forEach((m) => grouped[m.kind].push(m));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Payment Methods</h1>
        <p className="text-sm text-muted-foreground">
          Centrally manage how every tenant pays for their SikaFlow subscription. Active entries appear instantly on all tenant Billing pages.
        </p>
      </div>

      {/* Paystack — built-in, platform-managed gateway */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Globe className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">Paystack — Instant Online Payment</CardTitle>
              <p className="text-xs text-muted-foreground">
                Built-in card / MoMo / bank checkout. Configured at the platform level — no keys to manage here.
              </p>
            </div>
          </div>
          {paystackStatus === 'connected' && (
            <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Connected</Badge>
          )}
          {paystackStatus === 'error' && (
            <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Unavailable</Badge>
          )}
          {paystackStatus === 'checking' && (
            <Badge variant="secondary">Checking…</Badge>
          )}
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              {paystackStatus === 'connected' && 'Paystack is live for every tenant. Successful payments auto-activate subscriptions — no manual approval needed.'}
              {paystackStatus === 'error' && 'Paystack secret is missing or invalid. Tenants will see a fallback message and can still pay via MoMo or Bank Transfer.'}
              {paystackStatus === 'checking' && 'Verifying connection to Paystack…'}
            </p>
            <p className="text-[11px]">
              Paystack keys are stored as platform secrets — they never appear in this dashboard for security.
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
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">{meta.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">{meta.desc}</p>
                </div>
              </div>
              <Button size="sm" onClick={() => setEditing(empty(kind))}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : grouped[kind].length === 0 ? (
                <p className="text-xs text-muted-foreground">No {meta.title.toLowerCase()} configured yet.</p>
              ) : (
                <div className="space-y-2">
                  {grouped[kind].map((m) => (
                    <div key={m.id} className="flex flex-wrap items-start gap-3 justify-between border border-border rounded-lg p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">{m.label}</p>
                          {m.badge && <Badge variant="outline" className="text-[10px]">{m.badge}</Badge>}
                          {!m.active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground space-x-2">
                          {Object.entries(m.details).filter(([, v]) => v).map(([k, v]) => (
                            <span key={k}><span className="opacity-60">{k}:</span> <span className="font-mono">{String(v)}</span></span>
                          ))}
                        </div>
                        {m.instructions && <p className="text-[11px] text-muted-foreground mt-1">{m.instructions}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Switch checked={m.active} onCheckedChange={() => toggle(m)} />
                          <span className="text-[10px] text-muted-foreground">{m.active ? 'On' : 'Off'}</span>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(m)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(m)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Editor dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? 'Edit' : 'Add'} {editing ? KIND_META[editing.kind as Kind].title : ''}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Display label *</Label>
                <Input
                  value={editing.label ?? ''}
                  onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                  placeholder={editing.kind === 'momo' ? 'MTN MoMo' : 'GCB Main Account'}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {FIELDS[editing.kind as Kind].map((f) => (
                  <div key={f.key} className={f.full ? 'col-span-2' : ''}>
                    <Label className="text-xs">{f.label}</Label>
                    <Input
                      value={(editing.details as any)?.[f.key] ?? ''}
                      placeholder={f.placeholder}
                      onChange={(e) => setEditing({
                        ...editing,
                        details: { ...(editing.details ?? {}), [f.key]: e.target.value },
                      })}
                    />
                  </div>
                ))}
              </div>
              <div>
                <Label className="text-xs">Instructions / note</Label>
                <Textarea
                  rows={2}
                  value={editing.instructions ?? ''}
                  onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
                  placeholder="Optional message shown to tenants under this method."
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Badge (optional)</Label>
                  <Select
                    value={editing.badge || 'none'}
                    onValueChange={(v) => setEditing({ ...editing, badge: v === 'none' ? '' : v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="Recommended">Recommended</SelectItem>
                      <SelectItem value="Instant">Instant</SelectItem>
                      <SelectItem value="Manual Confirmation">Manual Confirmation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Display order</Label>
                  <Input
                    type="number"
                    value={editing.sort_order ?? 0}
                    onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editing.active ?? true} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
                <Label className="text-xs">Active (visible to tenants)</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
