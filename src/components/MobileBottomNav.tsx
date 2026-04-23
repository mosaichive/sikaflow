import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, ShoppingCart, Boxes, Receipt, MoreHorizontal, Users, BarChart3, PiggyBank, CreditCard, Settings, LogOut, Moon, Sun, X, LifeBuoy } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const PRIMARY = [
  { to: '/dashboard', label: 'Home', icon: Home, end: true },
  { to: '/sales', label: 'POS', icon: ShoppingCart },
  { to: '/inventory', label: 'Inventory', icon: Boxes, minRole: 'manager' as const },
  { to: '/expenses', label: 'Expenses', icon: Receipt, minRole: 'manager' as const },
];

const MORE_ITEMS = [
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/reports', label: 'Reports', icon: BarChart3, minRole: 'manager' as const },
  { to: '/support', label: 'Support', icon: LifeBuoy },
  { to: '/savings', label: 'Savings & Investments', icon: PiggyBank, adminOnly: true },
  { to: '/billing', label: 'Billing', icon: CreditCard, adminOnly: true },
  { to: '/settings', label: 'Settings', icon: Settings, adminOnly: true },
];

export function MobileBottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  const { isAdmin, isManager, displayName, avatarUrl, profileTitle, signOut } = useAuth();
  const { isDark, toggle } = useTheme();

  const canSee = (item: { minRole?: 'manager'; adminOnly?: boolean }) => {
    if (item.adminOnly) return isAdmin;
    if (item.minRole === 'manager') return isAdmin || isManager;
    return true;
  };

  const visiblePrimary = PRIMARY.filter(canSee);
  const visibleMore = MORE_ITEMS.filter(canSee);

  const go = (to: string) => {
    setMoreOpen(false);
    navigate(to);
  };

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-md"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Primary"
      >
        <ul className="grid grid-cols-5 h-16">
          {visiblePrimary.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`flex items-center justify-center h-8 w-12 rounded-xl transition-all ${isActive ? 'bg-primary/10' : ''}`}>
                      <item.icon className="h-5 w-5" />
                    </span>
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li>
            <button
              onClick={() => setMoreOpen(true)}
              className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="flex items-center justify-center h-8 w-12 rounded-xl">
                <MoreHorizontal className="h-5 w-5" />
              </span>
              <span>More</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl border-t border-border pb-8 max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <div className="flex items-center gap-3">
              <Avatar className="h-11 w-11">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                <AvatarFallback className="bg-primary/20 text-primary text-sm font-semibold">
                  {displayName?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <SheetTitle className="text-base">{displayName || 'User'}</SheetTitle>
                {profileTitle && <p className="text-xs text-muted-foreground">{profileTitle}</p>}
              </div>
              <button onClick={() => setMoreOpen(false)} className="p-2 rounded-lg text-muted-foreground hover:bg-secondary" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
          </SheetHeader>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {visibleMore.map((item) => (
              <button
                key={item.to}
                onClick={() => go(item.to)}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-secondary/30 hover:bg-secondary p-3 transition-colors"
              >
                <span className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <item.icon className="h-5 w-5 text-primary" />
                </span>
                <span className="text-[11px] text-foreground text-center leading-tight">{item.label}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={toggle}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-secondary/30 hover:bg-secondary py-3 text-sm text-foreground transition-colors"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </button>
            <button
              onClick={() => { setMoreOpen(false); signOut(); }}
              className="flex items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 py-3 text-sm text-destructive transition-colors"
            >
              <LogOut className="h-4 w-4" /> Sign Out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
