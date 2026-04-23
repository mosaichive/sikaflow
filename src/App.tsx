import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { BusinessProvider, useBusiness } from "@/context/BusinessContext";
import { SubscriptionProvider, useSubscription } from "@/context/SubscriptionContext";
import { SignInPage, SignUpPage } from "./pages/SignInPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import Dashboard from "./pages/Dashboard";
import SalesPage from "./pages/SalesPage";
import ProductsPage from "./pages/ProductsPage";
import InventoryPage from "./pages/InventoryPage";
import CustomersPage from "./pages/CustomersPage";
import ExpensesPage from "./pages/ExpensesPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import SavingsInvestmentsPage from "./pages/SavingsInvestmentsPage";
import BillingPage from "./pages/BillingPage";
import SupportPage from "./pages/SupportPage";
import PlatformLayout from "./pages/platform/PlatformLayout";
import PlatformDashboard from "./pages/platform/PlatformDashboard";
import BusinessesPage from "./pages/platform/BusinessesPage";
import SubscriptionsPage from "./pages/platform/SubscriptionsPage";
import PaymentsPage from "./pages/platform/PaymentsPage";
import PaymentMethodsPage from "./pages/platform/PaymentMethodsPage";
import AnnouncementsPage from "./pages/platform/AnnouncementsPage";
import AdsPage from "./pages/platform/AdsPage";
import ReferralsPage from "./pages/platform/ReferralsPage";
import PlatformSupportPage from "./pages/platform/PlatformSupportPage";
import NotFound from "./pages/NotFound";
import { BrandLoader } from "./components/BrandLoader";

const queryClient = new QueryClient();

function ProtectedRoute({
  children,
  adminOnly = false,
  minRole,
  allowReadOnly = false,
  allowOnboarding = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
  minRole?: 'admin' | 'manager';
  allowReadOnly?: boolean;
  allowOnboarding?: boolean;
}) {
  const { user, loading, isAdmin, role } = useAuth();
  const { business, loading: bizLoading } = useBusiness();
  const { hasAccess, subscription, loading: subLoading, isSuperAdmin } = useSubscription();
  const location = useLocation();

  if (loading || bizLoading || subLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><BrandLoader text="Loading..." size="md" /></div>;
  }
  if (!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  if (isSuperAdmin) return <Navigate to="/platform" replace />;
  if (!business && !allowOnboarding) return <Navigate to="/dashboard" replace />;

  // Subscription gating: only force billing if a subscription row exists AND access is truly denied.
  // This prevents a transient redirect to /billing while data is still resolving or for brand-new accounts.
  if (subscription && !hasAccess && !allowReadOnly) {
    return <Navigate to="/billing" replace />;
  }

  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;
  if (minRole === 'manager' && role !== 'admin' && role !== 'manager') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isSuperAdmin, loading: subLoading } = useSubscription();
  const location = useLocation();
  if (loading || subLoading) return <div className="min-h-screen flex items-center justify-center bg-background"><BrandLoader text="Loading..." size="md" /></div>;
  if (user && isSuperAdmin) return <Navigate to="/platform" replace />;
  if (user) {
    // If they were redirected here from a protected route, return to that page.
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && !from.startsWith('/sign-') && from !== '/auth' ? from : '/dashboard'} replace />;
  }
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <BusinessProvider>
          <SubscriptionProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/sign-in/*" element={<AuthRoute><SignInPage /></AuthRoute>} />
                <Route path="/sign-up/*" element={<AuthRoute><SignUpPage /></AuthRoute>} />
                <Route path="/auth/callback" element={<AuthCallbackPage />} />
                <Route path="/auth/*" element={<Navigate to="/sign-in" replace />} />
                <Route path="/reset-password" element={<Navigate to="/sign-in" replace />} />
                <Route path="/change-password" element={<Navigate to="/dashboard" replace />} />
                <Route path="/verify" element={<Navigate to="/dashboard" replace />} />

                {/* Platform Super Admin */}
                <Route path="/platform" element={<PlatformLayout />}>
                  <Route index element={<PlatformDashboard />} />
                  <Route path="businesses" element={<BusinessesPage />} />
                  <Route path="subscriptions" element={<SubscriptionsPage />} />
                  <Route path="payments" element={<PaymentsPage />} />
                  <Route path="payment-methods" element={<PaymentMethodsPage />} />
                  <Route path="referrals" element={<ReferralsPage />} />
                  <Route path="ads" element={<AdsPage />} />
                  <Route path="support" element={<PlatformSupportPage />} />
                  <Route path="announcements" element={<AnnouncementsPage />} />
                </Route>

                {/* Tenant app */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<ProtectedRoute allowReadOnly allowOnboarding><Dashboard /></ProtectedRoute>} />
                <Route path="/sales" element={<ProtectedRoute><SalesPage /></ProtectedRoute>} />
                <Route path="/products" element={<ProtectedRoute minRole="manager"><ProductsPage /></ProtectedRoute>} />
                <Route path="/inventory" element={<ProtectedRoute minRole="manager"><InventoryPage /></ProtectedRoute>} />
                <Route path="/customers" element={<ProtectedRoute><CustomersPage /></ProtectedRoute>} />
                <Route path="/expenses" element={<ProtectedRoute minRole="manager"><ExpensesPage /></ProtectedRoute>} />
                <Route path="/reports" element={<ProtectedRoute minRole="manager"><ReportsPage /></ProtectedRoute>} />
                <Route path="/support" element={<ProtectedRoute allowReadOnly allowOnboarding><SupportPage /></ProtectedRoute>} />
                <Route path="/savings" element={<ProtectedRoute adminOnly><SavingsInvestmentsPage /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute adminOnly allowReadOnly><SettingsPage /></ProtectedRoute>} />
                <Route path="/billing" element={<ProtectedRoute adminOnly allowReadOnly><BillingPage /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </SubscriptionProvider>
        </BusinessProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
