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
import { useBusinessFinancials } from '@/context/BusinessFinancialsContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, PAYMENT_METHODS, SIKAFLOW_TOOLTIPS } from '@/lib/constants';
import { toNumber } from '@/lib/sales-inventory';
import { AVAILABLE_BUSINESS_MONEY_FORMULA } from '@/lib/business-money';
import { AlertTriangle, Boxes, PackagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  insertRestockRecord,
  insertStockMovementCompat,
  loadProductsCompat,
  loadStockMovementsCompat,
  logSupabaseError,
  updateRestockRecord,
} from '@/lib/workspace';

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

type RestockRow = {
  id: string;
  product_id: string | null;
  product_name: string;
  category: string;
  quantity_added: number;
  cost_price_per_unit: number | string;
  total_cost: number | string;
  payment_method: string;
  note: string | null;
  reference: string | null;
  recorded_by_name: string | null;
  restock_date: string;
  status: string;
};

type InventoryHistoryRow = {
  id: string;
  entryType: 'opening_stock' | 'restock';
  date: string;
  productName: string;
  category: string;
  quantityAdded: number;
  costPerUnit: number;
  totalCost: number;
  paymentMethod: string | null;
  deductionStatus: string;
  noteReference: string | null;
  createdByName: string | null;
  editableRestock: RestockRow | null;
};

function extractRestockExpenseId(description: string | null | undefined) {
  const match = String(description ?? '').match(/\[RESTOCK:([a-f0-9-]+)\]/i);
  return match?.[1] ?? null;
}

export default function InventoryPage() {
  const { user, displayName, isAdmin, isManager } = useAuth();
  const { businessId } = useBusiness();
  const { financials, loading: financialsLoading } = useBusinessFinancials();
  const { toast } = useToast();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [restocks, setRestocks] = useState<RestockRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingRestock, setEditingRestock] = useState<RestockRow | null>(null);
  const [deletingRestockId, setDeletingRestockId] = useState<string | null>(null);
  const [form, setForm] = useState({
    product_id: '',
    movement_date: new Date().toISOString().slice(0, 10),
    quantity: '1',
    unit_cost: '0',
    selling_price: '0',
    payment_method: PAYMENT_METHODS[0].value,
    description: '',
  });

  const canManage = isAdmin || isManager;

  const load = useCallback(async () => {
    const [productsRes, movementsRes, restocksRes, expensesRes] = await Promise.allSettled([
      loadProductsCompat(false, businessId),
      loadStockMovementsCompat(100, businessId),
      supabase.from('restocks').select('*').eq('business_id', businessId).order('restock_date', { ascending: false }),
      supabase.from('expenses').select('*').eq('business_id', businessId),
    ]);

    if (productsRes.status === 'fulfilled') {
      setProducts(productsRes.value as ProductRow[]);
    } else {
      logSupabaseError('inventory.load.products', productsRes.reason);
      setProducts([]);
    }

    if (movementsRes.status === 'fulfilled') {
      setMovements(movementsRes.value as StockMovementRow[]);
    } else {
      logSupabaseError('inventory.load.movements', movementsRes.reason);
      setMovements([]);
    }

    if (restocksRes.status === 'fulfilled') {
      setRestocks(((restocksRes.value.data || []) as RestockRow[]) ?? []);
    } else {
      logSupabaseError('inventory.load.restocks', restocksRes.reason);
      setRestocks([]);
    }

    if (expensesRes.status === 'fulfilled') {
      setExpenses(((expensesRes.value.data || []) as ExpenseRow[]) ?? []);
    } else {
      logSupabaseError('inventory.load.expenses', expensesRes.reason);
      setExpenses([]);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
    if (!businessId) return;
    const channel = supabase
      .channel('inventory-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `business_id=eq.${businessId}` }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements', filter: `business_id=eq.${businessId}` }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restocks', filter: `business_id=eq.${businessId}` }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `business_id=eq.${businessId}` }, () => { void load(); })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, load]);

  const selectedProduct = products.find((product) => product.id === form.product_id) || null;
  const inventoryProducts = useMemo(
    () => [...products].sort((left, right) => left.name.localeCompare(right.name)),
    [products],
  );
  const lowStockProducts = useMemo(
    () =>
      products.filter((product) => {
        const quantity = toNumber(product.quantity);
        const threshold = toNumber(product.low_stock_threshold ?? product.reorder_level ?? 0);
        return quantity > 0 && quantity <= threshold;
      }),
    [products],
  );
  const totalRestockCost = useMemo(
    () => Math.max(0, Number(form.quantity || 0)) * Math.max(0, Number(form.unit_cost || 0)),
    [form.quantity, form.unit_cost],
  );
  const restockStockValueCost = useMemo(
    () => Math.max(0, Number(form.quantity || 0)) * Math.max(0, Number(form.unit_cost || 0)),
    [form.quantity, form.unit_cost],
  );

  useEffect(() => {
    if (!selectedProduct) return;
    setForm((current) => ({
      ...current,
      unit_cost:
        current.product_id === selectedProduct.id && current.unit_cost !== '0'
          ? current.unit_cost
          : String(Number(selectedProduct.cost_price || 0)),
      selling_price:
        current.product_id === selectedProduct.id && current.selling_price !== '0'
          ? current.selling_price
          : String(Number(selectedProduct.selling_price || 0)),
    }));
  }, [selectedProduct]);

  const restockExpenseByRestockId = useMemo(() => {
    const next = new Map<string, string>();
    for (const expense of expenses) {
      const restockId = extractRestockExpenseId(expense.description);
      if (restockId) {
        next.set(restockId, expense.id);
      }
    }
    return next;
  }, [expenses]);

  const inventoryHistory = useMemo<InventoryHistoryRow[]>(() => {
    const productMap = new Map(products.map((product) => [product.id, product]));
    const openingStockRows = movements
      .filter((movement) => movement.movement_type === 'opening_stock')
      .map((movement) => {
        const product = movement.product_id ? productMap.get(movement.product_id) : undefined;
        const quantityAdded = Math.max(0, toNumber(movement.quantity_change));
        const costPerUnit = toNumber(movement.unit_cost ?? product?.cost_price ?? 0);
        return {
          id: `opening-${movement.id}`,
          entryType: 'opening_stock' as const,
          date: movement.movement_date,
          productName: product?.name || 'Opening Stock',
          category: product?.category || '—',
          quantityAdded,
          costPerUnit,
          totalCost: quantityAdded * costPerUnit,
          paymentMethod: null,
          deductionStatus: 'Not deducted',
          noteReference: movement.note || 'Opening Stock',
          createdByName: movement.created_by_name || null,
          editableRestock: null,
        };
      });

    const restockRows = restocks.map((restock) => ({
      id: restock.id,
      entryType: 'restock' as const,
      date: restock.restock_date,
      productName: restock.product_name,
      category: restock.category || '—',
      quantityAdded: toNumber(restock.quantity_added),
      costPerUnit: toNumber(restock.cost_price_per_unit),
      totalCost: toNumber(restock.total_cost),
      paymentMethod: restock.payment_method || null,
      deductionStatus: 'Deducted from Available Money',
      noteReference: restock.note || restock.reference || null,
      createdByName: restock.recorded_by_name || null,
      editableRestock: restock,
    }));

    return [...restockRows, ...openingStockRows].sort(
      (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime(),
    );
  }, [movements, products, restocks]);

  const getStockStatus = useCallback((product: ProductRow) => {
    const quantity = toNumber(product.quantity);
    const threshold = toNumber(product.low_stock_threshold ?? product.reorder_level ?? 0);

    if (quantity < 0) {
      return {
        label: 'Negative Stock',
        className: 'border border-amber-500/30 bg-amber-500/10 text-amber-300',
      };
    }

    if (quantity === 0) {
      return {
        label: 'Out of Stock',
        className: 'border border-rose-500/30 bg-rose-500/10 text-rose-300',
      };
    }

    if (threshold > 0 && quantity <= threshold) {
      return {
        label: 'Low Stock',
        className: 'border border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
      };
    }

    return {
      label: 'In Stock',
      className: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    };
  }, []);

  const resetForm = () => {
    setForm({
      product_id: '',
      movement_date: new Date().toISOString().slice(0, 10),
      quantity: '1',
      unit_cost: '0',
      selling_price: '0',
      payment_method: PAYMENT_METHODS[0].value,
      description: '',
    });
    setEditingRestock(null);
  };

  const openCreateRestock = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditRestock = (restock: RestockRow) => {
    const product = products.find((row) => row.id === restock.product_id);
    setEditingRestock(restock);
    setForm({
      product_id: restock.product_id || '',
      movement_date: new Date(restock.restock_date).toISOString().slice(0, 10),
      quantity: String(restock.quantity_added),
      unit_cost: String(Number(restock.cost_price_per_unit || 0)),
      selling_price: String(Number(product?.selling_price || 0)),
      payment_method: restock.payment_method || PAYMENT_METHODS[0].value,
      description: restock.note || restock.reference || '',
    });
    setDialogOpen(true);
  };

  const cleanupLegacyRestockExpense = async (restockId: string) => {
    const existingExpenseId = restockExpenseByRestockId.get(restockId) || null;
    if (!existingExpenseId) return;
    const { error } = await supabase.from('expenses').delete().eq('id', existingExpenseId);
    if (error) throw error;
  };

  const upsertRestockMovement = async ({
    restockId,
    productId,
    quantityAdded,
    quantityAfter,
    unitCost,
    sellingPrice,
    note,
    movementDate,
  }: {
    restockId: string;
    productId: string;
    quantityAdded: number;
    quantityAfter: number;
    unitCost: number;
    sellingPrice: number;
    note: string;
    movementDate: string;
  }) => {
    try {
      const { data: existingRows, error: selectError } = await supabase
        .from('stock_movements' as any)
        .select('id')
        .eq('source_table', 'restocks')
        .eq('source_id', restockId)
        .limit(1);
      if (selectError) throw selectError;

      const payload = {
        business_id: businessId,
        product_id: productId,
        movement_type: 'restock',
        quantity_change: quantityAdded,
        quantity_after: quantityAfter,
        unit_cost: unitCost,
        unit_price: sellingPrice,
        note,
        created_by: user?.id,
        created_by_name: displayName || user?.email || '',
        movement_date: movementDate,
        source_table: 'restocks',
        source_id: restockId,
      };

      const existingMovement = (existingRows || [])[0] as { id: string } | undefined;
      if (existingMovement?.id) {
        const { error: updateError } = await supabase
          .from('stock_movements' as any)
          .update(payload)
          .eq('id', existingMovement.id);
        if (updateError) throw updateError;
        return;
      }

      const movementResult = await insertStockMovementCompat(payload);
      if (movementResult.skipped) {
        logSupabaseError('inventory.upsertRestockMovement.skipped', new Error('stock_movements table unavailable'), {
          restockId,
          productId,
        });
      }
    } catch (error) {
      logSupabaseError('inventory.upsertRestockMovement', error, {
        restockId,
        productId,
      });
    }
  };

  const deleteRestockMovement = async (restockId: string) => {
    try {
      const { error } = await supabase
        .from('stock_movements' as any)
        .delete()
        .eq('source_table', 'restocks')
        .eq('source_id', restockId);
      if (error) throw error;
    } catch (error) {
      logSupabaseError('inventory.deleteRestockMovement', error, { restockId });
    }
  };

  const saveRestock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !businessId || !selectedProduct || !canManage) return;

    const quantity = Math.max(0, Number(form.quantity || 0));
    const unitCost = Number(form.unit_cost || 0);
    const sellingPrice = Number(form.selling_price || selectedProduct?.selling_price || 0);
    if (quantity <= 0) {
      toast({ title: 'Quantity must be at least 1', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const totalCost = unitCost * quantity;
      const movementDate = new Date(`${form.movement_date}T00:00:00`).toISOString();
      const previousQuantity = Number(selectedProduct.quantity ?? 0);
      const oldQuantity = editingRestock ? Number(editingRestock.quantity_added ?? 0) : 0;
      const nextQuantity = editingRestock ? previousQuantity - oldQuantity + quantity : previousQuantity + quantity;

      const restockPayload = {
        business_id: businessId,
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        sku: '',
        category: selectedProduct.category || '',
        supplier: selectedProduct.supplier || '',
        quantity_added: quantity,
        cost_price_per_unit: unitCost,
        total_cost: totalCost,
        restock_date: movementDate,
        recorded_by: user.id,
        recorded_by_name: displayName || user.email || '',
        payment_method: form.payment_method,
        note: form.description,
        reference: form.description || null,
        status: 'active',
      };

      const savedRestock = editingRestock
        ? (await updateRestockRecord(editingRestock.id, restockPayload), {
            ...editingRestock,
            ...restockPayload,
            id: editingRestock.id,
          } as RestockRow)
        : ((await insertRestockRecord(restockPayload)) as unknown as RestockRow);

      await cleanupLegacyRestockExpense(savedRestock.id);

      const { error: productError } = await supabase
        .from('products')
        .update({
          quantity: nextQuantity,
          cost_price: unitCost,
          selling_price: sellingPrice,
        } as never)
        .eq('id', selectedProduct.id);
      if (productError) throw productError;

      await upsertRestockMovement({
        restockId: savedRestock.id,
        productId: selectedProduct.id,
        quantityAdded: quantity,
        quantityAfter: nextQuantity,
        unitCost,
        sellingPrice,
        note: form.description,
        movementDate,
      });

      setDialogOpen(false);
      resetForm();
      toast({
        title: editingRestock ? 'Restock updated' : 'Restock saved',
        description: 'Stock, stock value, and available business money were recalculated.',
      });
      void load();
    } catch (error) {
      logSupabaseError('inventory.saveRestock', error, {
        businessId,
        productId: selectedProduct.id,
        editingRestockId: editingRestock?.id ?? null,
      });
      toast({
        title: editingRestock ? 'Could not update restock' : 'Could not save restock',
        description: getErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteRestock = async (restock: RestockRow) => {
    if (!businessId || !canManage) return;
    const confirmed = window.confirm(`Delete restock for ${restock.product_name}? This will adjust stock immediately.`);
    if (!confirmed) return;
    setDeletingRestockId(restock.id);
    try {
      const product = products.find((row) => row.id === restock.product_id);
      if (product && restock.product_id) {
        const nextQuantity = Number(product.quantity ?? 0) - Number(restock.quantity_added ?? 0);
        const { error: productError } = await supabase
          .from('products')
          .update({ quantity: nextQuantity } as never)
          .eq('id', restock.product_id);
        if (productError) throw productError;
      }

      await cleanupLegacyRestockExpense(restock.id);

      await deleteRestockMovement(restock.id);

      const { error: restockError } = await supabase.from('restocks').delete().eq('id', restock.id);
      if (restockError) throw restockError;

      toast({ title: 'Restock deleted', description: 'Stock and available business money were recalculated.' });
      void load();
    } catch (error) {
      toast({
        title: 'Could not delete restock',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeletingRestockId(null);
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
              Track opening stock, restocks, returns, damaged stock, and manual adjustments. Products appear in stock only after you add inventory here.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-border bg-background px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Available Business Money</p>
              <p className="mt-1 text-lg font-semibold">{financialsLoading ? 'Loading…' : formatCurrency(financials.availableBusinessMoney)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{AVAILABLE_BUSINESS_MONEY_FORMULA}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Stock Value (Cost)</p>
              <p className="mt-1 text-lg font-semibold">{financialsLoading ? 'Loading…' : formatCurrency(financials.stockValue)}</p>
            </div>
            {canManage ? (
              <Button onClick={openCreateRestock}><Plus className="mr-2 h-4 w-4" /> Add Restock</Button>
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
              <DialogTitle>{editingRestock ? 'Edit Restock' : 'Add Restock'}</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={saveRestock}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Product</Label>
                  <Select
                    value={form.product_id}
                    disabled={!!editingRestock}
                    onValueChange={(value) => {
                      const product = products.find((item) => item.id === value);
                      setForm((current) => ({
                        ...current,
                        product_id: value,
                        unit_cost: String(Number(product?.cost_price || 0)),
                        selling_price: String(Number(product?.selling_price || 0)),
                      }));
                    }}
                  >
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
                  <Label>Date</Label>
                  <Input type="date" value={form.movement_date} onChange={(event) => setForm((current) => ({ ...current, movement_date: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Quantity Added</Label>
                  <Input type="number" min="1" step="1" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Cost Per Unit (Buying Price)</Label>
                  <Input type="number" min="0" step="0.01" value={form.unit_cost} onChange={(event) => setForm((current) => ({ ...current, unit_cost: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Selling Price (Customer Price)</Label>
                  <Input type="number" min="0" step="0.01" value={form.selling_price} onChange={(event) => setForm((current) => ({ ...current, selling_price: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Total Cost (Buying Cost)</Label>
                  <Input value={formatCurrency(totalRestockCost)} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Stock Value (Cost)</Label>
                  <Input value={formatCurrency(restockStockValueCost)} readOnly />
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
                <div className="space-y-2 md:col-span-2">
                  <Label>Note / Reference (optional)</Label>
                  <Textarea rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <p className="text-sm font-medium">Restock money logic</p>
                <p className="text-xs text-muted-foreground">
                  Restocks are automatically deducted from Available Business Money. Opening Stock is not deducted.
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Saving...' : editingRestock ? 'Update Restock' : 'Save Restock'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <div className="space-y-4">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Current Stock</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {inventoryProducts.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Low Stock</TableHead>
                        <TableHead>Stock Value (Cost)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventoryProducts.map((product) => {
                        const quantity = toNumber(product.quantity);
                        const stockStatus = getStockStatus(product);
                        return (
                          <TableRow key={product.id}>
                            <TableCell className="font-medium">
                              {product.name}
                            </TableCell>
                            <TableCell>{product.category || '—'}</TableCell>
                            <TableCell className={quantity < 0 ? 'font-semibold text-amber-300' : quantity === 0 ? 'font-medium text-rose-300' : undefined}>
                              {quantity}
                            </TableCell>
                            <TableCell>
                              <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${stockStatus.className}`}>
                                {stockStatus.label}
                              </span>
                            </TableCell>
                            <TableCell>{product.low_stock_threshold ?? product.reorder_level ?? 0}</TableCell>
                            <TableCell>{formatCurrency(quantity * Number(product.cost_price || 0))}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState
                  icon={<Boxes className="h-7 w-7 text-muted-foreground" />}
                  title="No products in inventory yet"
                  description="Add products first, then use Add Restock to bring them into stock. Products with Opening Stock stay visible here too."
                />
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Restock History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {restocks.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Quantity Added</TableHead>
                        <TableHead>Cost Per Unit</TableHead>
                        <TableHead>Total Cost</TableHead>
                        <TableHead>Payment Method</TableHead>
                        <TableHead>Deduction Status</TableHead>
                        <TableHead>Note / Reference</TableHead>
                        <TableHead>Created By</TableHead>
                        {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventoryHistory.map((entry) => {
                        const isOpeningStock = entry.entryType === 'opening_stock';
                        return (
                          <TableRow key={entry.id}>
                            <TableCell>{new Date(entry.date).toLocaleDateString('en-GH')}</TableCell>
                            <TableCell>
                              <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${isOpeningStock ? 'bg-sky-500/10 text-sky-300' : 'bg-primary/10 text-primary'}`}>
                                {isOpeningStock ? 'Opening Stock' : 'Restock'}
                              </span>
                            </TableCell>
                            <TableCell className="font-medium">{entry.productName}</TableCell>
                            <TableCell>{entry.category || '—'}</TableCell>
                            <TableCell>{entry.quantityAdded}</TableCell>
                            <TableCell>{formatCurrency(entry.costPerUnit)}</TableCell>
                            <TableCell>{formatCurrency(entry.totalCost)}</TableCell>
                            <TableCell>{entry.paymentMethod ? (PAYMENT_METHODS.find((method) => method.value === entry.paymentMethod)?.label ?? entry.paymentMethod) : '—'}</TableCell>
                            <TableCell>
                              <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${isOpeningStock ? 'bg-muted text-muted-foreground' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                {entry.deductionStatus}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[220px] truncate">{entry.noteReference || '—'}</TableCell>
                            <TableCell>{entry.createdByName || '—'}</TableCell>
                            {canManage ? (
                              <TableCell className="text-right">
                                {entry.editableRestock ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => openEditRestock(entry.editableRestock!)}>
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-destructive"
                                      disabled={deletingRestockId === entry.editableRestock.id}
                                      onClick={() => void deleteRestock(entry.editableRestock!)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Setup only</span>
                                )}
                              </TableCell>
                            ) : null}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState
                  icon={<PackagePlus className="h-7 w-7 text-muted-foreground" />}
                  title="No restocks yet"
                  description="Opening Stock and restocks will appear here with deduction status, payment details, and edit/delete actions."
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
