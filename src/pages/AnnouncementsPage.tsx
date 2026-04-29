import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Bell, Info, Megaphone } from 'lucide-react';
import { logSupabaseError } from '@/lib/workspace';

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  level: 'info' | 'warning' | 'critical';
  audience: string;
  created_at: string;
  starts_at: string;
  target_business_id?: string | null;
};

type ReadRow = {
  announcement_id: string;
  user_id: string;
};

function getLevelIcon(level: AnnouncementRow['level']) {
  if (level === 'critical') return AlertTriangle;
  if (level === 'warning') return Megaphone;
  return Info;
}

function getLevelTone(level: AnnouncementRow['level']) {
  if (level === 'critical') {
    return {
      border: 'border-destructive/30',
      badge: 'destructive' as const,
      icon: 'text-destructive',
    };
  }
  if (level === 'warning') {
    return {
      border: 'border-amber-500/30',
      badge: 'secondary' as const,
      icon: 'text-amber-500',
    };
  }
  return {
    border: 'border-primary/20',
    badge: 'outline' as const,
    icon: 'text-primary',
  };
}

export default function AnnouncementsPage() {
  const { user, role } = useAuth();
  const { businessId } = useBusiness();
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [reads, setReads] = useState<ReadRow[]>([]);

  const load = useCallback(async () => {
    if (!user || !businessId) {
      setRows([]);
      setReads([]);
      return;
    }

    const [announcementsRes, readsRes] = await Promise.all([
      supabase
        .from('platform_announcements' as any)
        .select('id,title,body,level,audience,created_at,starts_at,target_business_id')
        .eq('active', true)
        .order('starts_at', { ascending: false }),
      supabase
        .from('platform_announcement_reads' as any)
        .select('announcement_id,user_id')
        .eq('user_id', user.id)
        .eq('business_id', businessId),
    ]);

    if (announcementsRes.error) {
      logSupabaseError('tenantAnnouncements.loadAnnouncements', announcementsRes.error, {
        userId: user.id,
        businessId,
      });
    }

    if (readsRes.error) {
      logSupabaseError('tenantAnnouncements.loadReads', readsRes.error, {
        userId: user.id,
        businessId,
      });
    }

    setRows(((announcementsRes.data || []) as AnnouncementRow[]) ?? []);
    setReads(((readsRes.data || []) as ReadRow[]) ?? []);
  }, [businessId, user]);

  useEffect(() => {
    void load();

    const channel = supabase
      .channel(`tenant-platform-announcements-${user?.id || 'guest'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_announcements' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_announcement_reads' }, () => { void load(); })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, user?.id]);

  useEffect(() => {
    if (!user || !businessId || rows.length === 0) return;

    const unreadRows = rows.filter((row) => !reads.some((read) => read.announcement_id === row.id && read.user_id === user.id));
    if (unreadRows.length === 0) return;

    void supabase
      .from('platform_announcement_reads' as any)
      .upsert(
        unreadRows.map((row) => ({
          announcement_id: row.id,
          user_id: user.id,
          business_id: businessId,
          read_at: new Date().toISOString(),
        })),
        { onConflict: 'announcement_id,user_id' },
      )
      .then(({ error }) => {
        if (error) {
          logSupabaseError('tenantAnnouncements.markRead', error, {
            userId: user.id,
            businessId,
            announcementIds: unreadRows.map((row) => row.id),
          });
        }
      });
  }, [businessId, reads, rows, user]);

  const unreadIds = useMemo(
    () => new Set(reads.filter((read) => read.user_id === user?.id).map((read) => read.announcement_id)),
    [reads, user?.id],
  );

  return (
    <AppLayout title="Announcements">
      <div className="space-y-6">
        <section className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/75 p-5">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Announcements</h1>
            <p className="text-sm text-muted-foreground">
              Platform notices from SikaFlow for your workspace. This page is read-only for {role === 'admin' ? 'tenant admins' : 'team members'}.
            </p>
          </div>
        </section>

        <Card className="border-border/70">
          <CardContent className="space-y-4 p-4">
            {rows.length > 0 ? (
              rows.map((row) => {
                const Icon = getLevelIcon(row.level);
                const tone = getLevelTone(row.level);
                const isRead = unreadIds.has(row.id);
                return (
                  <article
                    key={row.id}
                    className={`rounded-2xl border bg-card/50 p-4 transition-colors ${tone.border}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 rounded-2xl bg-primary/10 p-2">
                          <Icon className={`h-4 w-4 ${tone.icon}`} />
                        </span>
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold text-foreground">{row.title}</p>
                            <Badge variant={tone.badge}>{row.level}</Badge>
                            <Badge variant={isRead ? 'secondary' : 'default'}>
                              {isRead ? 'Read' : 'Unread'}
                            </Badge>
                          </div>
                          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{row.body}</p>
                        </div>
                      </div>

                      <div className="text-right text-xs text-muted-foreground">
                        <p>{new Date(row.starts_at || row.created_at).toLocaleDateString('en-GH')}</p>
                        <p className="mt-1 uppercase tracking-[0.14em]">{row.audience.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <EmptyState
                icon={<Bell className="h-7 w-7 text-muted-foreground" />}
                title="No announcements right now"
                description="When SikaFlow sends updates for your workspace, they will appear here."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
