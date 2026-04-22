import { useEffect, useState } from 'react';
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
import { Trash2 } from 'lucide-react';

type Row = { id: string; title: string; body: string; level: string; audience: string; active: boolean; starts_at: string; ends_at: string | null; created_at: string; };

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [level, setLevel] = useState('info');
  const [audience, setAudience] = useState('all_tenants');
  const [active, setActive] = useState(true);
  const [startsAt, setStartsAt] = useState<string>(toLocalInputValue(new Date()));
  const [endsAt, setEndsAt] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('platform_announcements' as any).select('*').order('created_at', { ascending: false });
    setRows((data as any) ?? []);
  };
  useEffect(() => { void load(); }, []);

  const resetForm = () => {
    setTitle(''); setBody(''); setLevel('info'); setAudience('all_tenants'); setActive(true);
    setStartsAt(toLocalInputValue(new Date())); setEndsAt('');
  };

  const create = async () => {
    if (!title.trim()) return toast({ title: 'Title required', variant: 'destructive' });
    if (title.length > 120) return toast({ title: 'Title too long', description: 'Keep titles under 120 characters.', variant: 'destructive' });
    if (body.length > 1000) return toast({ title: 'Body too long', description: 'Keep body under 1000 characters.', variant: 'destructive' });

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
      active,
      starts_at: startsIso,
      ends_at: endsIso,
      created_by: user?.id,
    });
    setSubmitting(false);
    if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    resetForm();
    toast({ title: 'Announcement published' });
    await load();
  };

  const toggleActive = async (id: string, next: boolean) => {
    const { error } = await supabase.from('platform_announcements' as any).update({ active: next }).eq('id', id);
    if (error) return toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    await load();
  };

  const remove = async (id: string) => {
    await supabase.from('platform_announcements' as any).delete().eq('id', id);
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Announcements</h1>
        <p className="text-sm text-muted-foreground">Notices visible to tenant admins. Use sparingly — appears in their dashboard.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compose Announcement</CardTitle>
          <p className="text-xs text-muted-foreground">Visible to tenant admins on their dashboard between the start and end dates.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Title <span className="text-muted-foreground">({title.length}/120)</span></Label>
            <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Scheduled maintenance Saturday" />
          </div>
          <div>
            <Label className="text-xs">Body <span className="text-muted-foreground">({body.length}/1000)</span></Label>
            <Textarea rows={3} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Brief details for tenants..." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_tenants">All tenants</SelectItem>
                  <SelectItem value="trial">Trial only</SelectItem>
                  <SelectItem value="paid">Paid only</SelectItem>
                  <SelectItem value="expired">Expired only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 sm:mt-5">
              <Switch checked={active} onCheckedChange={setActive} id="ann-active" />
              <Label htmlFor="ann-active" className="text-xs">Active</Label>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
        <CardHeader><CardTitle className="text-base">Existing</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">No announcements yet.</p>}
          {rows.map((r) => {
            const start = new Date(r.starts_at);
            const end = r.ends_at ? new Date(r.ends_at) : null;
            const now = new Date();
            const scheduled = start > now;
            const expired = end !== null && end <= now;
            return (
              <div key={r.id} className="flex items-start justify-between border border-border rounded-lg p-3 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px] uppercase">{r.level}</Badge>
                    <Badge variant={r.active ? 'default' : 'secondary'} className="text-[10px]">{r.active ? 'Active' : 'Off'}</Badge>
                    {scheduled && <Badge variant="outline" className="text-[10px]">Scheduled</Badge>}
                    {expired && <Badge variant="outline" className="text-[10px]">Expired</Badge>}
                    <span className="text-[10px] text-muted-foreground">to {r.audience}</span>
                  </div>
                  <p className="text-sm font-semibold truncate">{r.title}</p>
                  {r.body && <p className="text-xs text-muted-foreground line-clamp-2">{r.body}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {start.toLocaleString()} {end ? `→ ${end.toLocaleString()}` : '→ no end'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={r.active} onCheckedChange={(v) => toggleActive(r.id, v)} aria-label="Toggle active" />
                  <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
