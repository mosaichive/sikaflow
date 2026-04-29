import { ReactNode, useEffect, useState } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { PageTransition } from '@/components/PageTransition';
import { Bell } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { useTheme } from '@/hooks/useTheme';
import { useIsMobile } from '@/hooks/use-mobile';
import { Logo } from '@/components/Logo';
import { ReferralNotifications } from '@/components/referrals/ReferralNotifications';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export function AppLayout({ children, title }: { children: ReactNode; title?: string }) {
  const { user, displayName, avatarUrl, profileTitle } = useAuth();
  const { business, businessId } = useBusiness();
  const { isDark } = useTheme();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const tenantLogo = isDark ? business?.logo_dark_url : business?.logo_light_url;
  const [announcementBadge, setAnnouncementBadge] = useState(0);

  useEffect(() => {
    if (!user || !businessId) {
      setAnnouncementBadge(0);
      return;
    }

    let cancelled = false;

    const loadAnnouncementBadge = async () => {
      const [{ data: announcements }, { data: reads }] = await Promise.all([
        supabase.from('platform_announcements' as any).select('id').eq('active', true),
        supabase.from('platform_announcement_reads' as any).select('announcement_id').eq('user_id', user.id).eq('business_id', businessId),
      ]);

      if (cancelled) return;

      const readIds = new Set(((reads || []) as any[]).map((row) => row.announcement_id));
      const unread = ((announcements || []) as any[]).filter((row) => !readIds.has(row.id)).length;
      setAnnouncementBadge(unread);
    };

    void loadAnnouncementBadge();

    const channel = supabase
      .channel(`app-layout-announcements-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_announcements' }, () => { void loadAnnouncementBadge(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_announcement_reads' }, () => { void loadAnnouncementBadge(); })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [businessId, user]);

  return (
    <SidebarProvider>
      <ReferralNotifications />
      <div className="min-h-screen flex w-full bg-background">
        {!isMobile && <AppSidebar />}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border px-4 bg-card/80 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex items-center gap-3">
              {!isMobile && <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors duration-200" />}
              <div className="flex items-center gap-2 md:hidden">
                {tenantLogo ? (
                  <img src={tenantLogo} alt={business?.name || 'Workspace'} className="h-6 w-6 object-contain" />
                ) : (
                  <Logo className="h-6 w-6 object-contain" />
                )}
                <span className="text-sm font-semibold text-foreground truncate max-w-[140px]">
                  {business?.name || 'SikaFlow'}
                </span>
              </div>
              {title && <h1 className="text-lg font-semibold text-foreground hidden md:block">{title}</h1>}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/announcements')}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-200 active:scale-95 relative"
              >
                <Bell className="h-4 w-4" />
                {announcementBadge > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {announcementBadge > 9 ? '9+' : announcementBadge}
                  </span>
                ) : null}
              </button>
              <div className="flex items-center gap-2">
                <Avatar className="h-7 w-7">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                  <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-semibold">
                    {displayName?.charAt(0)?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden md:block">
                  <p className="text-xs font-medium text-foreground leading-tight">{displayName || 'User'}</p>
                  {profileTitle && <p className="text-[10px] text-muted-foreground leading-tight">{profileTitle}</p>}
                </div>
              </div>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto pb-24 md:pb-6">
            <PageTransition>
              {children}
            </PageTransition>
          </main>
        </div>
        <MobileBottomNav />
      </div>
    </SidebarProvider>
  );
}
