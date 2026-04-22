import {
  LayoutDashboard, ShoppingCart, Package, Boxes, Users, Receipt, BarChart3, PiggyBank, Settings, LogOut, Moon, Sun, CreditCard
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { useTheme } from '@/hooks/useTheme';
import { Logo } from '@/components/Logo';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const allItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Sales Entry', url: '/sales', icon: ShoppingCart },
  { title: 'Products', url: '/products', icon: Package },
  { title: 'Inventory', url: '/inventory', icon: Boxes },
  { title: 'Customers', url: '/customers', icon: Users },
  { title: 'Expenses', url: '/expenses', icon: Receipt },
  { title: 'Reports', url: '/reports', icon: BarChart3 },
  { title: 'Savings & Invest', url: '/savings', icon: PiggyBank },
  { title: 'Billing', url: '/billing', icon: CreditCard },
  { title: 'Settings', url: '/settings', icon: Settings },
];

const staffItems = ['Dashboard', 'Sales Entry', 'Customers'];
const managerItems = ['Dashboard', 'Sales Entry', 'Products', 'Inventory', 'Customers', 'Expenses', 'Reports'];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { isAdmin, isManager, displayName, avatarUrl, profileTitle, signOut, role } = useAuth();
  const { business } = useBusiness();
  const { isDark, toggle } = useTheme();

  const items = isAdmin ? allItems : isManager ? allItems.filter(i => managerItems.includes(i.title)) : allItems.filter(i => staffItems.includes(i.title));

  const tenantName = business?.name || 'SikaFlow';
  const tenantLogoLight = business?.logo_light_url; // shown in light mode (black logo)
  const tenantLogoDark = business?.logo_dark_url;   // shown in dark mode (white logo)
  const tenantLogo = isDark ? tenantLogoDark : tenantLogoLight;

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <div className="p-4 flex items-center gap-3">
        {tenantLogo ? (
          <img src={tenantLogo} alt={tenantName} className="w-9 h-9 object-contain shrink-0" />
        ) : (
          <Logo className="w-9 h-9 object-contain shrink-0" />
        )}
        {!collapsed && (
          <div>
            <h2 className="text-base font-bold text-foreground tracking-tight">{tenantName}</h2>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">SikaFlow</p>
          </div>
        )}
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
            {!collapsed && 'Menu'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/dashboard'}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-200"
                      activeClassName="bg-primary/10 text-primary font-semibold"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 space-y-2">
        {!collapsed && (
          <>
            <button onClick={toggle} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
            <button onClick={signOut} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
              <Avatar className="h-8 w-8">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                  {displayName?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{displayName || 'User'}</p>
                {profileTitle && <p className="text-[10px] text-muted-foreground truncate">{profileTitle}</p>}
              </div>
            </div>
          </>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
