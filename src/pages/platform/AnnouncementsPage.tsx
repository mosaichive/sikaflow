import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Building2, Eye, Trash2 } from 'lucide-react';
import { getErrorMessage, logSupabaseError } from '@/lib/workspace';

type AudienceKey =
  | 'all_tenants'
  | 'active_subscribers'
  | 'expired_subscribers'
  | 'trial_users'
  | 'specific_tenant'
  | 'paid'
  | 'trial'
  | 'expired';

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  level: string;
  audience: AudienceKey;
  active: boolean;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  target_business_id: string | null;
};

type TargetBusiness = {
  id: string;
  name: string;
  email: string | null;
  status: string;
};

const AUDIENCE_OPTIONS: Array<{ value: AudienceKey; label: string; description: string }> = [
  { value: 'all_tenants', label: 'All tenants', description: 'Every signed-in tenant account' },
  { value: 'active_subscribers', label: 'Active subscribers', description: 'Paid active and lifetime tenants' },
  { value: 'expired_subscribers', label: 'Expired subscribers', description: 'Expired, overdue, or suspended tenants' },
  { value: 'trial_users', label: 'Trial users', description: 'Businesses still in free trial' },
  { value: 'specific_tenant', label: 'Specific tenant', description: 'One selected tenant account only' },
];

const AUDIENCE_LABELS: Record<string, string> = {
  all_tenants: 'All tenants',
  active_subscribers: 'Active subscribers',
  expired_subscribers: 'Expired subscribers',
  trial_users: 'Trial users',
  specific_tenant: 'Specific tenant',
  paid: 'Active subscribers',
  expired: 'Expired subscribers',
  trial: 'Trial users',
};

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [targets, setTargets] = useState<TargetBusiness[]>([]);
  const [readCounts, setReadCounts] = useState<Record<string, number>>({});
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [level, setLevel] = useState('info');
  const [audience, setAudience] = useState<AudienceKey>('all_tenants');
  const [targetBusinessId, setTargetBusinessId] = useState('');
  const [active, setActive] = useState(true);
  const [startsAt, setStartsAt] = useState<string>(toLocalInputValue(new Date()));
  const [endsAt, setEndsAt] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const targetMap = useMemo(
    () => new Map(targets.map((target) => [target.id, target])),
    [targets],
  );

  const load = async () => {
    const [announcementsRes, targetsRes, readsRes] = await Promise.all([
      supabase
        .from('platform_announcements' as any)
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('businesses' as any)
        .select('id,name,email,status')
        .order('name'),
      supabase
        .from('platform_announcement_reads' as any)
        .select('announcement_id'),
    ]);

    if (announcementsRes.error) {
      logSupabaseError('superAdminAnnouncements.loadAnnouncements', announcementsRes.error);
    }
    if (targetsRes.error) {
      logSupabaseError('superAdminAnnouncements.loadTargets', targetsRes.error);
    }
    if (readsRes.error) {
      logSupabaseError('superAdminAnnouncements.loadReadCounts', readsRes.error);
    }

    setRows(((announcementsRes.data || []) as AnnouncementRow[]) ?? []);
    setTargets(((targetsRes.data || []) as TargetBusiness[]) ?? []);

    const nextCounts: Record<string, number> = {};
    for (const row of ((readsRes.data || []) as Array<{ announcement_id: string }>)) {
      nextCounts[row.announcement_id] = (nextCounts[row.announcement_id] || 0) + 1;
    }
    setReadCounts(nextCounts);
  };

  useEffect(() => {
    void load();

    const channel = supabase
      .channel('super-admin-announcements')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_announcements' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_announcement_reads' }, () => { void load(); })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const resetForm = () => {
    setTitle('');
    setBody('');
    setLevel('info');
    setAudience('all_tenants');
    setTargetBusinessId('');
    setActive(true);
    setStartsAt(toLocalInputValue(new Date()));
    setEndsAt('');
  };

  const create = async () => {
    if (!title.trim()) {
      return toast({ title: 'Title required', variant: 'destructive' });
    }
    if (title.length > 120) {
      return toast({ title: 'Title too long', description: 'Keep titles under 120 characters.', variant: 'destructive' });
    }
    if (body.length > 1000) {
      return toast({ title: 'Body too long', description: 'Keep body under 1000 characters.', variant: 'destructive' });
    }
    if (audience === 'specific_tenant' && !targetBusinessId) {
      return toast({ title: 'Select a tenant', description: 'Choose the tenant account that should receive this announcement.', variant: 'destructive' });
    }

    const startsIso = startsAt ? new Date(startsAt).toISOString() : new Date().toISOString();
    const endsIso = endsAt ? new Date(endsAt).toISOString() : null;
    if (endsIso && new Date(endsIso) <= new Date(startsIso)) {
      return toast({ title: 'Invalid date range', description: 'End date must be after start date.', variant: 'destructive' });
    }

    setSubmitting(true);
    const { error } = await supabase.from('platform_announcements' as any).insert({
      title: title.trim(),
      body: body.trim(),
      level,
      audience,
      target_business_id: audience === 'specific_tenant' ? targetBusinessId : null,
      active,
      starts_at: startsIso,
      ends_at: endsIso,
      created_by: user?.id,
    });
    setSubmitting(false);

    if (error) {
      logSupabaseError('superAdminAnnouncements.create', error, {
        audience,
        targetBusinessId: audience === 'specific_tenant' ? targetBusinessId : null,
      });
      return toast({ title: 'Failed', description: getErrorMessage(error), variant: 'destructive' });
    }

    resetForm();
    toast({ title: 'Announcement published' });
    await load();
  };

  const toggleActive = async (id: string, next: boolean) => {
    const { error } = await supabase.from('platform_announcements' as any).update({ active: next }).eq('id', id);
    if (error) {
      logSupabaseError('superAdminAnnouncements.toggleActive', error, { announcementId: id, active: next });
      return toast({ title: 'Update failed', description: getErrorMessage(error), variant: 'destructive' });
    }
    await load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('platform_announcements' as any).delete().eq('id', id);
    if (error) {
      logSupabaseError('superAdminAnnouncements.remove', error, { announcementId: id });
      return toast({ title: 'Delete failed', description: getErrorMessage(error), variant: 'destructive' });
    }
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Announcements</h1>
        <p className="text-sm text-muted-foreground">
          Super Admin publishes platform notices here. Tenant users only receive and read them inside their own workspace.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compose Announcement</CardTitle>
          <p className="text-xs text-muted-foreground">
            Target all tenants, paid accounts, expired accounts, trial users, or a specific tenant without exposing private business records.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Title <span className="text-muted-foreground">({title.length}/120)</span></Label>
            <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Scheduled maintenance Saturday" />
          </div>

          <div>
            <Label className="text-xs">Body <span className="text-muted-foreground">({body.length}/1000)</span></Label>
            <Textarea rows={3} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Brief details for tenant workspaces..." />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Level</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Audience</Label>
              <Select value={audience} onValueChange={(value) => {
                setAudience(value as AudienceKey);
                if (value !== 'specific_tenant') setTargetBusinessId('');
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUDIENCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {AUDIENCE_OPTIONS.find((option) => option.value === audience)?.description}
              </p>
            </div>

            <div className="flex items-center gap-2 sm:mt-5">
              <Switch checked={active} onCheckedChange={setActive} id="ann-active" />
              <Label htmlFor="ann-active" className="text-xs">Active</Label>
            </div>
          </div>

          {audience === 'specific_tenant' ? (
            <div>
              <Label className="text-xs">Specific tenant account</Label>
              <Select value={targetBusinessId} onValueChange={setTargetBusinessId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a tenant business" />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((target) => (
                    <SelectItem key={target.id} value={target.id}>
                      {target.name} {target.email ? `• ${target.email}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Start date & time</Label>
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">End date & time <span className="text-muted-foreground">(optional)</span></Label>
              <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={create} disabled={submitting}>{submitting ? 'Publishing…' : 'Publish'}</Button>
            <Button variant="ghost" onClick={resetForm} disabled={submitting}>Reset</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Existing Announcements</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">No announcements yet.</p> : null}

          {rows.map((row) => {
            const start = new Date(row.starts_at);
            const end = row.ends_at ? new Date(row.ends_at) : null;
            const now = new Date();
            const scheduled = start > now;
            const expired = end !== null && end <= now;
            const target = row.target_business_id ? targetMap.get(row.target_business_id) : null;
            return (
              <div key={row.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase">{row.level}</Badge>
                    <Badge variant={row.active ? 'default' : 'secondary'} className="text-[10px]">{row.active ? 'Active' : 'Off'}</Badge>
                    {scheduled ? <Badge variant="outline" className="text-[10px]">Scheduled</Badge> : null}
                    {expired ? <Badge variant="outline" className="text-[10px]">Expired</Badge> : null}
                    <span className="text-[10px] text-muted-foreground">to {AUDIENCE_LABELS[row.audience] || row.audience}</span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Eye className="h-3 w-3" /> {readCounts[row.id] || 0} reads
                    </span>
                  </div>

                  <p className="text-sm font-semibold truncate">{row.title}</p>
                  {row.body ? <p className="text-xs text-muted-foreground line-clamp-2">{row.body}</p> : null}
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {start.toLocaleString()} {end ? `→ ${end.toLocaleString()}` : '→ no end'}
                  </p>
                  {target ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Building2 className="h-3 w-3" /> {target.name}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Switch checked={row.active} onCheckedChange={(value) => toggleActive(row.id, value)} aria-label="Toggle active" />
                  <Button size="sm" variant="ghost" onClick={() => remove(row.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
