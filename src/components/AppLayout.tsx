import { ReactNode } from 'react';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function AppLayout({ children, title }: { children: ReactNode; title?: string }) {
  const { displayName, avatarUrl, profileTitle } = useAuth();
  const { business } = useBusiness();
  const { isDark } = useTheme();
  const isMobile = useIsMobile();
  const tenantLogo = isDark ? business?.logo_dark_url : business?.logo_light_url;

  return (
    <SidebarProvider>
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
              <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-200 active:scale-95 relative">
                <Bell className="h-4 w-4" />
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
