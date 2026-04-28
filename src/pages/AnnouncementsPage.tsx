import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { supabase } from '@/integrations/supabase/client';
import { Bell, Plus, Trash2 } from 'lucide-react';

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  active: boolean;
  created_by_name?: string | null;
  created_at: string;
};

type ReadRow = {
  announcement_id: string;
  user_id: string;
};

export default function AnnouncementsPage() {
  const { user, displayName, isAdmin, isManager } = useAuth();
  const { businessId } = useBusiness();
  const { toast } = useToast();
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [reads, setReads] = useState<ReadRow[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', active: true });

  const canManage = isAdmin || isManager;

  const load = useCallback(async () => {
    const [rowsRes, readsRes] = await Promise.all([
      supabase.from('business_announcements' as any).select('*').order('created_at', { ascending: false }),
      supabase.from('business_announcement_reads' as any).select('announcement_id,user_id'),
    ]);
    setRows((rowsRes.data || []) as AnnouncementRow[]);
    setReads((readsRes.data || []) as ReadRow[]);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel('tenant-announcements-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_announcements' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_announcement_reads' }, () => { void load(); })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    if (!user || !businessId || rows.length === 0) return;
    const unread = rows.filter((row) => row.active).filter((row) => !reads.some((read) => read.announcement_id === row.id && read.user_id === user.id));
    if (unread.length === 0) return;

    void supabase.from('business_announcement_reads' as any).upsert(
      unread.map((row) => ({
        announcement_id: row.id,
        user_id: user.id,
        business_id: businessId,
        read_at: new Date().toISOString(),
      })),
      { onConflict: 'announcement_id,user_id' },
    );
  }, [businessId, reads, rows, user]);

  const readCountByAnnouncement = useMemo(() => {
    const counts = new Map<string, number>();
    reads.forEach((row) => {
      counts.set(row.announcement_id, (counts.get(row.announcement_id) || 0) + 1);
    });
    return counts;
  }, [reads]);

  const createAnnouncement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!businessId || !user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('business_announcements' as any).insert({
        business_id: businessId,
        title: form.title,
        body: form.body,
        active: form.active,
        created_by: user.id,
        created_by_name: displayName || user.email || '',
      });
      if (error) throw error;
      toast({ title: 'Announcement sent' });
      setForm({ title: '', body: '', active: true });
      setOpen(false);
      void load();
    } catch (error) {
      toast({
        title: 'Could not create announcement',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: AnnouncementRow) => {
    const { error } = await supabase.from('business_announcements' as any).update({ active: !row.active }).eq('id', row.id);
    if (error) {
      toast({ title: 'Could not update announcement', description: error.message, variant: 'destructive' });
      return;
    }
    void load();
  };

  const deleteRow = async (id: string) => {
    const { error } = await supabase.from('business_announcements' as any).delete().eq('id', id);
    if (error) {
      toast({ title: 'Could not delete announcement', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Announcement deleted' });
  };

  return (
    <AppLayout title="Announcements">
      <div className="space-y-6">
        <section className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/75 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Announcements</h1>
            <p className="text-sm text-muted-foreground">
              Share quick updates, notices, and instructions with your team. Read counts update as users see each announcement.
            </p>
          </div>
          {canManage ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> New Announcement</Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Create Announcement</DialogTitle>
                </DialogHeader>
                <form className="space-y-4" onSubmit={createAnnouncement}>
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Message</Label>
                    <Textarea rows={5} value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} required />
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-border/60 p-3">
                    <div>
                      <p className="text-sm font-medium">Publish immediately</p>
                      <p className="text-xs text-muted-foreground">Inactive announcements stay hidden from the team.</p>
                    </div>
                    <Switch checked={form.active} onCheckedChange={(checked) => setForm((current) => ({ ...current, active: checked }))} />
                  </div>
                  <Button type="submit" className="w-full" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Announcement'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </section>

        <Card className="border-border/70">
          <CardContent className="p-0">
            {rows.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Announcement</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Read Count</TableHead>
                      <TableHead>Created</TableHead>
                      {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">{row.title}</p>
                            <p className="max-w-xl text-sm text-muted-foreground">{row.body}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={row.active ? 'default' : 'secondary'}>{row.active ? 'Active' : 'Hidden'}</Badge>
                        </TableCell>
                        <TableCell>{readCountByAnnouncement.get(row.id) || 0}</TableCell>
                        <TableCell>{new Date(row.created_at).toLocaleDateString('en-GH')}</TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => void toggleActive(row)}>
                                {row.active ? 'Hide' : 'Show'}
                              </Button>
                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void deleteRow(row.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                icon={<Bell className="h-7 w-7 text-muted-foreground" />}
                title="No announcements yet"
                description="Use announcements to push quick updates to your team without leaving the workspace."
                action={canManage ? <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> New Announcement</Button> : undefined}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
