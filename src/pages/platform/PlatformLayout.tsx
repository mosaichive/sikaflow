import { Link, NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Building2, CreditCard, Receipt, Megaphone, ShieldAlert, LogOut, Wallet, ImagePlus } from 'lucide-react';
import { BrandLoader } from '@/components/BrandLoader';

const NAV = [
  { to: '/platform', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/platform/businesses', label: 'Businesses', icon: Building2 },
  { to: '/platform/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: '/platform/payments', label: 'Payments', icon: Receipt },
  { to: '/platform/payment-methods', label: 'Payment Methods', icon: Wallet },
  { to: '/platform/ads', label: 'Ads', icon: ImagePlus },
  { to: '/platform/announcements', label: 'Announcements', icon: Megaphone },
];

export default function PlatformLayout() {
  const { user, loading, signOut } = useAuth();
  const { isSuperAdmin, loading: subLoading } = useSubscription();

  if (loading || subLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><BrandLoader text="Loading..." size="md" /></div>;
  if (!user) return <Navigate to="/sign-in" replace />;
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-60 border-r border-border bg-card/50 flex flex-col">
        <div className="p-4 flex items-center gap-3 border-b border-border">
          <Logo className="h-9 w-9" />
          <div>
            <h2 className="text-sm font-bold tracking-tight">SikaFlow</h2>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Platform Admin</p>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`
              }
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2 flex items-start gap-2">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-[10px] text-muted-foreground leading-tight">
              Platform-level access. Tenant business data is private.
            </p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sign Out
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card/50">
          <div>
            <p className="text-xs text-muted-foreground">Signed in as</p>
            <p className="text-sm font-semibold text-foreground">{user.email}</p>
          </div>
          <ThemeToggle />
        </header>
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
