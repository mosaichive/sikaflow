import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { type BusinessFinancials, calculateBusinessFinancials } from '@/lib/business-money';
import { supabase } from '@/integrations/supabase/client';
import { loadProductsCompat, logSupabaseError } from '@/lib/workspace';

type BusinessFinancialsContextValue = {
  financials: BusinessFinancials;
  loading: boolean;
  refresh: () => Promise<void>;
};

const EMPTY_FINANCIALS = calculateBusinessFinancials({
  sales: [],
  saleItems: [],
  products: [],
  otherIncome: [],
  expenses: [],
  savings: [],
  investments: [],
  investorFunds: [],
  restocks: [],
  openingCashBalance: 0,
});

const BusinessFinancialsContext = createContext<BusinessFinancialsContextValue | undefined>(undefined);

export function BusinessFinancialsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { businessId, loading: businessLoading } = useBusiness();
  const [financials, setFinancials] = useState<BusinessFinancials>(EMPTY_FINANCIALS);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const load = useCallback(async (showLoading = false) => {
    if (inFlightRef.current) return inFlightRef.current;

    const run = (async () => {
      if (!user || businessLoading) {
        setFinancials(EMPTY_FINANCIALS);
        setLoading(true);
        hasLoadedOnceRef.current = false;
        return;
      }

      if (!businessId) {
        setFinancials(EMPTY_FINANCIALS);
        setLoading(false);
        hasLoadedOnceRef.current = true;
        return;
      }

      if (showLoading || !hasLoadedOnceRef.current) setLoading(true);

      try {
        const [salesRes, productsRes, expensesRes, otherIncomeRes, savingsRes, investmentsRes, investorFundsRes, restocksRes] =
          await Promise.allSettled([
            supabase
              .from('sales')
              .select('id,total,amount_paid,payment_status,status,sale_date,stock_status')
              .eq('business_id', businessId)
              .order('sale_date', { ascending: false }),
            loadProductsCompat(false, businessId),
            supabase.from('expenses').select('amount,category,description').eq('business_id', businessId),
            supabase.from('other_income' as any).select('amount').eq('business_id', businessId),
            supabase.from('savings').select('amount').eq('business_id', businessId),
            supabase.from('investments').select('amount').eq('business_id', businessId),
            supabase.from('investor_funding').select('amount').eq('business_id', businessId),
            supabase.from('restocks').select('total_cost,status').eq('business_id', businessId).order('restock_date', { ascending: false }),
          ]);

        if (salesRes.status === 'rejected') logSupabaseError('financials.load.sales', salesRes.reason, { businessId });
        if (productsRes.status === 'rejected') logSupabaseError('financials.load.products', productsRes.reason, { businessId });
        if (expensesRes.status === 'rejected') logSupabaseError('financials.load.expenses', expensesRes.reason, { businessId });
        if (otherIncomeRes.status === 'rejected') logSupabaseError('financials.load.otherIncome', otherIncomeRes.reason, { businessId });
        if (savingsRes.status === 'rejected') logSupabaseError('financials.load.savings', savingsRes.reason, { businessId });
        if (investmentsRes.status === 'rejected') logSupabaseError('financials.load.investments', investmentsRes.reason, { businessId });
        if (investorFundsRes.status === 'rejected') logSupabaseError('financials.load.investorFunds', investorFundsRes.reason, { businessId });
        if (restocksRes.status === 'rejected') logSupabaseError('financials.load.restocks', restocksRes.reason, { businessId });

        if (salesRes.status === 'fulfilled' && salesRes.value.error) logSupabaseError('financials.load.sales', salesRes.value.error, { businessId });
        if (expensesRes.status === 'fulfilled' && expensesRes.value.error) logSupabaseError('financials.load.expenses', expensesRes.value.error, { businessId });
        if (otherIncomeRes.status === 'fulfilled' && otherIncomeRes.value.error) logSupabaseError('financials.load.otherIncome', otherIncomeRes.value.error, { businessId });
        if (savingsRes.status === 'fulfilled' && savingsRes.value.error) logSupabaseError('financials.load.savings', savingsRes.value.error, { businessId });
        if (investmentsRes.status === 'fulfilled' && investmentsRes.value.error) logSupabaseError('financials.load.investments', investmentsRes.value.error, { businessId });
        if (investorFundsRes.status === 'fulfilled' && investorFundsRes.value.error) logSupabaseError('financials.load.investorFunds', investorFundsRes.value.error, { businessId });
        if (restocksRes.status === 'fulfilled' && restocksRes.value.error) logSupabaseError('financials.load.restocks', restocksRes.value.error, { businessId });

        const sales = salesRes.status === 'fulfilled' ? (salesRes.value.data ?? []) : [];
        let saleItems: any[] = [];

        if (salesRes.status === 'fulfilled' && !salesRes.value.error) {
          const saleIds = sales.map((sale: any) => sale.id).filter(Boolean);
          if (saleIds.length > 0) {
            const { data, error } = await supabase
              .from('sale_items')
              .select('sale_id,quantity,cost_price,unit_price,line_total')
              .in('sale_id', saleIds);

            if (error) {
              logSupabaseError('financials.load.saleItems', error, { businessId, saleCount: saleIds.length });
            } else {
              saleItems = data ?? [];
            }
          }
        }

        const next = calculateBusinessFinancials({
          sales,
          saleItems,
          products: productsRes.status === 'fulfilled' ? (productsRes.value ?? []) : [],
          otherIncome: otherIncomeRes.status === 'fulfilled' ? (otherIncomeRes.value.data ?? []) : [],
          expenses: expensesRes.status === 'fulfilled' ? (expensesRes.value.data ?? []) : [],
          savings: savingsRes.status === 'fulfilled' ? (savingsRes.value.data ?? []) : [],
          investments: investmentsRes.status === 'fulfilled' ? (investmentsRes.value.data ?? []) : [],
          investorFunds: investorFundsRes.status === 'fulfilled' ? (investorFundsRes.value.data ?? []) : [],
          restocks: restocksRes.status === 'fulfilled' ? (restocksRes.value.data ?? []) : [],
          openingCashBalance: 0,
        });

        console.info('Financial Breakdown:', next);
        setFinancials(next);
      } finally {
        setLoading(false);
        hasLoadedOnceRef.current = true;
      }
    })();

    inFlightRef.current = run.finally(() => {
      inFlightRef.current = null;
    });

    return inFlightRef.current;
  }, [businessId, businessLoading, user]);

  useEffect(() => {
    hasLoadedOnceRef.current = false;
    void load(true);
  }, [load]);

  useEffect(() => {
    if (!user || !businessId) return;

    const refresh = () => {
      void load(false);
    };

    const channel = supabase
      .channel(`business-financials:${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales', filter: `business_id=eq.${businessId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `business_id=eq.${businessId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `business_id=eq.${businessId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'other_income', filter: `business_id=eq.${businessId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restocks', filter: `business_id=eq.${businessId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'savings', filter: `business_id=eq.${businessId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investments', filter: `business_id=eq.${businessId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investor_funding', filter: `business_id=eq.${businessId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements', filter: `business_id=eq.${businessId}` }, refresh)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, load, user]);

  const refresh = useCallback(() => load(false), [load]);

  const value = useMemo(
    () => ({
      financials,
      loading,
      refresh,
    }),
    [financials, loading, refresh],
  );

  return <BusinessFinancialsContext.Provider value={value}>{children}</BusinessFinancialsContext.Provider>;
}

export function useBusinessFinancials() {
  const context = useContext(BusinessFinancialsContext);
  if (!context) throw new Error('useBusinessFinancials must be used within BusinessFinancialsProvider');
  return context;
}
