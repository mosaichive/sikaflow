import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, PAYMENT_METHODS, STOCK_MOVEMENT_TYPES, SIKAFLOW_TOOLTIPS } from '@/lib/constants';
import { calculateAvailableBusinessMoney, calculateStockValue, toNumber } from '@/lib/sales-inventory';
import { AlertTriangle, Boxes, PackagePlus, Plus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type ProductRow = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  cost_price: number | string;
  selling_price: number | string;
  low_stock_threshold?: number | null;
  reorder_level?: number | null;
  supplier?: string | null;
};

type StockMovementRow = {
  id: string;
  product_id: string | null;
  movement_type: string;
  quantity_change: number;
  quantity_after: number;
  unit_cost: number | string;
  unit_price: number | string;
  note: string;
  created_by_name?: string | null;
  movement_date: string;
};

export default function InventoryPage() {
  const { user, displayName, isAdmin, isManager, isDistributor } = useAuth();
  const { businessId } = useBusiness();
  const { toast } = useToast();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [availableMoney, setAvailableMoney] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    product_id: '',
    movement_type: 'restock',
    quantity: '1',
    unit_cost: '0',
    payment_method: PAYMENT_METHODS[0].value,
    description: '',
    record_restocks_expense: false,
    manual_direction: 'increase',
  });

  const canManage = isAdmin || isManager;

  const load = useCallback(async () => {
    const [productsRes, movementsRes, salesRes, expensesRes, savingsRes, investmentsRes, otherIncomeRes] = await Promise.all([
      supabase.from('products').select('*').eq('is_archived', false).order('name'),
      supabase.from('stock_movements' as any).select('*').order('movement_date', { ascending: false }).limit(100),
      supabase.from('sales').select('total,amount_paid,payment_status,status'),
      supabase.from('expenses').select('amount'),
      supabase.from('savings').select('amount'),
      supabase.from('investments').select('amount'),
      supabase.from('other_income' as any).select('amount'),
    ]);

    setProducts((productsRes.data || []) as ProductRow[]);
    setMovements((movementsRes.data || []) as StockMovementRow[]);
    const money = calculateAvailableBusinessMoney({
      sales: (salesRes.data || []) as any[],
      otherIncome: (otherIncomeRes.data || []) as any[],
      expenses: (expensesRes.data || []) as any[],
      savings: (savingsRes.data || []) as any[],
      investments: (investmentsRes.data || []) as any[],
    });
    setAvailableMoney(money.availableBusinessMoney);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel('inventory-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restocks' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => { void load(); })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const selectedProduct = products.find((product) => product.id === form.product_id) || null;
  const stockValue = useMemo(() => calculateStockValue(products, 'cost'), [products]);
  const lowStockProducts = useMemo(
    () => products.filter((product) => product.quantity <= toNumber(product.low_stock_threshold ?? product.reorder_level ?? 0)),
    [products],
  );

  const saveMovement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !businessId || !selectedProduct || !canManage) return;

    const quantity = Math.max(0, Number(form.quantity || 0));
    const unitCost = Number(form.unit_cost || 0);
    if (quantity <= 0) {
      toast({ title: 'Quantity must be at least 1', variant: 'destructive' });
      return;
    }

    let quantityChange = quantity;
    if (form.movement_type === 'sale' || form.movement_type === 'damaged_stock') {
      quantityChange = -quantity;
    }
    if (form.movement_type === 'manual_adjustment' && form.manual_direction === 'decrease') {
      quantityChange = -quantity;
    }

    const nextQuantity = selectedProduct.quantity + quantityChange;
    if (nextQuantity < 0) {
      toast({ title: 'Not enough stock', description: 'This adjustment would move stock below zero.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { error: productError } = await supabase.from('products').update({ quantity: nextQuantity } as never).eq('id', selectedProduct.id);
      if (productError) throw productError;

      const { error: movementError } = await supabase.from('stock_movements' as any).insert({
        business_id: businessId,
        product_id: selectedProduct.id,
        movement_type: form.movement_type,
        quantity_change: quantityChange,
        quantity_after: nextQuantity,
        unit_cost: unitCost,
        unit_price: selectedProduct.selling_price,
        note: form.description,
        created_by: user.id,
        created_by_name: displayName || user.email || '',
        movement_date: new Date().toISOString(),
      });
      if (movementError) throw movementError;

      if (form.movement_type === 'restock') {
        const totalCost = unitCost * quantity;
        const { error: restockError } = await supabase.from('restocks').insert({
          business_id: businessId,
          product_id: selectedProduct.id,
          product_name: selectedProduct.name,
          sku: '',
          category: selectedProduct.category || '',
          supplier: selectedProduct.supplier || '',
          quantity_added: quantity,
          cost_price_per_unit: unitCost,
          total_cost: totalCost,
          restock_date: new Date().toISOString(),
          recorded_by: user.id,
          recorded_by_name: displayName || user.email || '',
          payment_method: form.payment_method,
          note: form.description,
          status: 'active',
        });
        if (restockError) throw restockError;

        if (form.record_restocks_expense) {
          const { error: expenseError } = await supabase.from('expenses').insert({
            business_id: businessId,
            category: 'Restock',
            description: `Restock for ${selectedProduct.name}${form.description ? ` - ${form.description}` : ''}`,
            amount: totalCost,
            payment_method: form.payment_method,
            expense_date: new Date().toISOString(),
            recorded_by: user.id,
            recorded_by_name: displayName || user.email || '',
          });
          if (expenseError) throw expenseError;
        }

        if (totalCost > availableMoney) {
          toast({
            title: 'Restock saved with low-cash warning',
            description: `Restock still went through even though it exceeds available business money by ${formatCurrency(totalCost - availableMoney)}.`,
          });
        } else {
          toast({ title: 'Restock saved', description: 'Inventory has been increased.' });
        }
      } else {
        toast({ title: 'Inventory updated', description: `${selectedProduct.name} has been updated successfully.` });
      }

      setDialogOpen(false);
      setForm({
        product_id: '',
        movement_type: 'restock',
        quantity: '1',
        unit_cost: '0',
        payment_method: PAYMENT_METHODS[0].value,
        description: '',
        record_restocks_expense: false,
        manual_direction: 'increase',
      });
      void load();
    } catch (error) {
      toast({
        title: 'Could not save inventory change',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout title="Inventory">
      <div className="space-y-6">
        <section className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/75 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-xs text-muted-foreground underline decoration-dotted underline-offset-4">
                    Opening Stock
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-sm">
                  {SIKAFLOW_TOOLTIPS.openingStock}
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-sm text-muted-foreground">
              Track opening stock, restocks, returns, damaged stock, and manual adjustments. Restocking is never blocked by available money.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-border bg-background px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Available Business Money</p>
              <p className="mt-1 text-lg font-semibold">{formatCurrency(availableMoney)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Stock Value (Cost)</p>
              <p className="mt-1 text-lg font-semibold">{formatCurrency(stockValue)}</p>
            </div>
            {canManage ? (
              <Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" /> Record Inventory Change</Button>
            ) : null}
          </div>
        </section>

        {lowStockProducts.length > 0 ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Low stock: {lowStockProducts.map((product) => `${product.name} (${product.quantity})`).join(', ')}
            </AlertDescription>
          </Alert>
        ) : null}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Record Inventory Change</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={saveMovement}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Product</Label>
                  <Select value={form.product_id} onValueChange={(value) => setForm((current) => ({ ...current, product_id: value }))}>
                    <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} • {product.quantity} in stock
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Movement Type</Label>
                  <Select value={form.movement_type} onValueChange={(value) => setForm((current) => ({ ...current, movement_type: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STOCK_MOVEMENT_TYPES.filter((type) => type.value !== 'opening_stock' && type.value !== 'sale').map((type) => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input type="number" min="1" step="1" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} />
                </div>
                {form.movement_type === 'manual_adjustment' ? (
                  <div className="space-y-2">
                    <Label>Adjustment Direction</Label>
                    <Select value={form.manual_direction} onValueChange={(value) => setForm((current) => ({ ...current, manual_direction: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="increase">Increase stock</SelectItem>
                        <SelectItem value="decrease">Decrease stock</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                {form.movement_type === 'restock' ? (
                  <>
                    <div className="space-y-2">
                      <Label>Cost Per Unit</Label>
                      <Input type="number" min="0" step="0.01" value={form.unit_cost} onChange={(event) => setForm((current) => ({ ...current, unit_cost: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Payment Method</Label>
                      <Select value={form.payment_method} onValueChange={(value) => setForm((current) => ({ ...current, payment_method: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((method) => (
                            <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : null}
                <div className="space-y-2 md:col-span-2">
                  <Label>Description / Note</Label>
                  <Textarea rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
                </div>
              </div>

              {form.movement_type === 'restock' ? (
                <label className="flex items-start gap-3 rounded-2xl border border-border/60 p-4">
                  <input
                    type="checkbox"
                    checked={form.record_restocks_expense}
                    onChange={(event) => setForm((current) => ({ ...current, record_restocks_expense: event.target.checked }))}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-medium">Record this restock as expense</p>
                    <p className="text-xs text-muted-foreground">If enabled, SikaFlow saves a matching expense entry. If business money is low, you&apos;ll get a warning only.</p>
                  </div>
                </label>
              ) : null}

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Saving...' : 'Save Inventory Change'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Current Stock</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {products.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Low Stock</TableHead>
                        <TableHead>Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="font-medium">{product.name}</TableCell>
                          <TableCell>{product.category || '—'}</TableCell>
                          <TableCell>{product.quantity}</TableCell>
                          <TableCell>{product.low_stock_threshold ?? product.reorder_level ?? 0}</TableCell>
                          <TableCell>{formatCurrency(product.quantity * Number(product.cost_price || 0))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState
                  icon={<Boxes className="h-7 w-7 text-muted-foreground" />}
                  title="No products in inventory yet"
                  description="Add products first, then record opening stock, restocks, returns, or adjustments here."
                />
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Stock Movement History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {movements.length > 0 ? (
                movements.map((movement) => (
                  <div key={movement.id} className="rounded-2xl border border-border/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold capitalize">{movement.movement_type.replaceAll('_', ' ')}</p>
                        <p className="text-xs text-muted-foreground">{movement.note || movement.created_by_name || 'Inventory update'}</p>
                      </div>
                      <p className={`text-sm font-semibold ${movement.quantity_change >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {movement.quantity_change > 0 ? '+' : ''}
                        {movement.quantity_change}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{new Date(movement.movement_date).toLocaleString('en-GH')}</span>
                      <span>Stock after: {movement.quantity_after}</span>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={<PackagePlus className="h-7 w-7 text-muted-foreground" />}
                  title="No stock movements yet"
                  description="Opening stock, restocks, returns, and adjustments will appear here."
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
