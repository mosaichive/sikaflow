import { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { formatCurrency } from '@/lib/constants';
import { calculateAvailableBusinessMoney } from '@/lib/business-money';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Boxes, Search, AlertTriangle, PackagePlus, Trash2, Pencil, CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface RestockRecord {
  id: string; product_id: string | null; product_name: string; sku: string;
  category: string; supplier: string; quantity_added: number;
  cost_price_per_unit: number; total_cost: number; restock_date: string;
  recorded_by: string; recorded_by_name: string; payment_method: string;
  bank_account_id: string | null; reference: string; note: string; created_at: string;
  status: string;
}

export default function InventoryPage() {
  const { isAdmin, user } = useAuth();
  const { businessId } = useBusiness();
  const { toast } = useToast();
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [restockProduct, setRestockProduct] = useState<any | null>(null);
  const [restockQty, setRestockQty] = useState(0);
  const [loading, setLoading] = useState(false);
  const [banks, setBanks] = useState<any[]>([]);
  const [restocks, setRestocks] = useState<RestockRecord[]>([]);
  const [saleItems, setSaleItems] = useState<any[]>([]);
  const [availableCash, setAvailableCash] = useState(0);

  // Add Restock dialog (select product mode)
  const [addRestockOpen, setAddRestockOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');

  // Restock form fields
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [bankAccountId, setBankAccountId] = useState('');
  const [reference, setReference] = useState('');
  const [restockNote, setRestockNote] = useState('');
  const [restockDate, setRestockDate] = useState<Date>(new Date());
  const [restockCostPerUnit, setRestockCostPerUnit] = useState(0);

  // Restock history filters
  const [restockSearch, setRestockSearch] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const [filterBank, setFilterBank] = useState('all');
  const [restockDateFrom, setRestockDateFrom] = useState('');
  const [restockDateTo, setRestockDateTo] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Edit restock
  const [editRestock, setEditRestock] = useState<RestockRecord | null>(null);
  const [editQty, setEditQty] = useState(0);
  const [editNote, setEditNote] = useState('');

  // Delete confirmation
  const [deleteRestock, setDeleteRestock] = useState<RestockRecord | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    fetchAll();
    const ch = supabase.channel('inventory-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restocks' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'savings' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investments' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'other_income' }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchAll = async () => {
    const [prodRes, bankRes, restockRes, salesRes, expRes, savRes, invRes, otherIncomeRes, saleItemsRes] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('bank_accounts').select('*').order('created_at', { ascending: false }),
      supabase.from('restocks').select('*').order('restock_date', { ascending: false }),
      supabase.from('sales').select('total, amount_paid, payment_status'),
      supabase.from('expenses').select('amount'),
      supabase.from('savings').select('amount'),
      supabase.from('investments').select('amount'),
      supabase.from('other_income' as any).select('amount'),
      supabase.from('sale_items').select('product_id, quantity'),
    ]);
    setProducts(prodRes.data || []);
    setBanks(bankRes.data || []);
    setRestocks((restockRes.data || []) as any);
    setSaleItems(saleItemsRes.data || []);

    const moneySummary = calculateAvailableBusinessMoney({
      sales: (salesRes.data || []) as any[],
      otherIncome: (otherIncomeRes.data || []) as any[],
      expenses: (expRes.data || []) as any[],
      savings: (savRes.data || []) as any[],
      investments: (invRes.data || []) as any[],
    });
    setAvailableCash(moneySummary.availableBusinessMoney);
  };

  // Calculate stock from restocks - sales
  const stockMap = useMemo(() => {
    const map: Record<string, { restocked: number; sold: number }> = {};
    for (const p of products) {
      map[p.id] = { restocked: 0, sold: 0 };
    }
    for (const r of restocks) {
      if (r.product_id && r.status === 'active' && map[r.product_id]) {
        map[r.product_id].restocked += r.quantity_added;
      }
    }
    for (const si of saleItems) {
      if (si.product_id && map[si.product_id]) {
        map[si.product_id].sold += si.quantity;
      }
    }
    return map;
  }, [products, restocks, saleItems]);

  const getStock = (productId: string) => {
    const entry = stockMap[productId];
    if (!entry) return 0;
    return Math.max(0, entry.restocked - entry.sold);
  };

  const openRestockForProduct = (p: any) => {
    setRestockProduct(p);
    setRestockQty(0);
    setRestockCostPerUnit(Number(p.cost_price));
    setPaymentMethod('cash');
    setBankAccountId('');
    setReference('');
    setRestockNote('');
    setRestockDate(new Date());
  };

  const handleAddRestockOpen = () => {
    setSelectedProductId('');
    setAddRestockOpen(true);
  };

  const handleAddRestockConfirm = () => {
    const p = products.find(pr => pr.id === selectedProductId);
    if (p) {
      setAddRestockOpen(false);
      openRestockForProduct(p);
    }
  };

  const handleRestock = async () => {
    if (!restockProduct || restockQty <= 0 || !user) return;
    const costPerUnit = restockCostPerUnit;
    const totalCost = costPerUnit * restockQty;

    if (totalCost > availableCash) {
      toast({ title: 'Insufficient available funds for restocking', description: `You only have ${formatCurrency(availableCash)} available. Restock cost: ${formatCurrency(totalCost)}.`, variant: 'destructive' });
      return;
    }

    setLoading(true);
    const { data: profile } = await supabase.from('profiles').select('display_name').eq('user_id', user.id).single();

    // Update stored quantity on the product (for backward compat with sales)
    const currentStock = getStock(restockProduct.id);
    await supabase.from('products')
      .update({ quantity: currentStock + restockQty })
      .eq('id', restockProduct.id);

    if (!businessId) { toast({ title: 'No business selected', variant: 'destructive' }); return; }
    const { error: restockErr } = await supabase.from('restocks').insert({
      business_id: businessId,
      product_id: restockProduct.id,
      product_name: restockProduct.name,
      sku: restockProduct.sku,
      category: restockProduct.category || '',
      supplier: restockProduct.supplier || '',
      quantity_added: restockQty,
      cost_price_per_unit: costPerUnit,
      total_cost: totalCost,
      restock_date: restockDate.toISOString(),
      recorded_by: user.id,
      recorded_by_name: profile?.display_name || user.email || '',
      payment_method: paymentMethod,
      bank_account_id: bankAccountId || null,
      reference,
      note: restockNote,
      status: 'active',
    });

    if (restockErr) {
      toast({ title: 'Error recording restock', description: restockErr.message, variant: 'destructive' });
    } else {
      toast({ title: 'Stock updated & spending recorded!', description: `Added ${restockQty} units to ${restockProduct.name}. ${formatCurrency(totalCost)} deducted from available cash.` });
    }

    setRestockProduct(null);
    setRestockQty(0);
    setRestockCostPerUnit(0);
    setPaymentMethod('cash');
    setBankAccountId('');
    setReference('');
    setRestockNote('');
    setRestockDate(new Date());
    setLoading(false);
  };

  const handleDeleteRestock = async () => {
    if (!deleteRestock) return;
    const r = deleteRestock;
    setDeleteLoading(true);

    const { error } = await supabase.from('restocks').delete().eq('id', r.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Restock deleted & reversed', description: `Stock reversed and ${formatCurrency(Number(r.total_cost))} restored to available cash.` });
    }
    setDeleteRestock(null);
    setDeleteLoading(false);
  };

  const handleEditRestock = async () => {
    if (!editRestock || editQty <= 0) return;
    setLoading(true);

    const oldQty = editRestock.quantity_added;
    const diff = editQty - oldQty;
    const costPerUnit = Number(editRestock.cost_price_per_unit);
    const newTotalCost = editQty * costPerUnit;

    if (diff > 0) {
      const additionalCost = diff * costPerUnit;
      if (additionalCost > availableCash) {
        toast({ title: 'Insufficient funds', description: `Need ${formatCurrency(additionalCost)} more but only ${formatCurrency(availableCash)} available.`, variant: 'destructive' });
        setLoading(false);
        return;
      }
    }

    // Update product stored quantity for backward compat
    if (diff !== 0 && editRestock.product_id) {
      const product = products.find(p => p.id === editRestock.product_id);
      if (product) {
        await supabase.from('products').update({ quantity: Math.max(0, product.quantity + diff) }).eq('id', product.id);
      }
    }

    const { error } = await supabase.from('restocks').update({
      quantity_added: editQty,
      total_cost: newTotalCost,
      note: editNote,
    }).eq('id', editRestock.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Restock updated', description: `Quantity changed from ${oldQty} to ${editQty}.` });
    }

    setEditRestock(null);
    setLoading(false);
  };

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const lowStock = products.filter(p => {
    const stock = getStock(p.id);
    return stock > 0 && stock <= p.reorder_level;
  });
  const outOfStock = products.filter(p => getStock(p.id) === 0);
  const totalValue = products.reduce((sum, p) => sum + Number(p.selling_price) * getStock(p.id), 0);
  const activeRestocks = restocks.filter(r => r.status === 'active');
  const totalRestockSpending = activeRestocks.reduce((s, r) => s + Number(r.total_cost), 0);

  const suppliers = [...new Set(restocks.map(r => r.supplier).filter(Boolean))];
  const paymentMethods = [...new Set(restocks.map(r => r.payment_method))];

  const filteredRestocks = restocks
    .filter(r => {
      if (restockSearch && !r.product_name.toLowerCase().includes(restockSearch.toLowerCase()) && !r.sku.toLowerCase().includes(restockSearch.toLowerCase())) return false;
      if (filterSupplier !== 'all' && r.supplier !== filterSupplier) return false;
      if (filterPayment !== 'all' && r.payment_method !== filterPayment) return false;
      if (filterBank !== 'all' && r.bank_account_id !== filterBank) return false;
      if (restockDateFrom && new Date(r.restock_date) < new Date(`${restockDateFrom}T00:00:00`)) return false;
      if (restockDateTo && new Date(r.restock_date) > new Date(`${restockDateTo}T23:59:59`)) return false;
      return true;
    })
    .sort((a, b) => sortOrder === 'newest'
      ? new Date(b.restock_date).getTime() - new Date(a.restock_date).getTime()
      : new Date(a.restock_date).getTime() - new Date(b.restock_date).getTime()
    );

  const statusBadge = (status: string) => {
    const cfg: Record<string, string> = {
      active: 'bg-success/10 text-success border-success/20',
      reversed: 'bg-warning/10 text-warning border-warning/20',
      deleted: 'bg-destructive/10 text-destructive border-destructive/20',
    };
    return <Badge variant="outline" className={`text-xs font-medium ${cfg[status] || ''}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
  };

  return (
    <AppLayout title="Inventory">
      <div className="space-y-6 animate-fade-in">
        {/* Top Action Bar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm text-muted-foreground">Manage stock levels through restocking</p>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Button onClick={handleAddRestockOpen}>
                <PackagePlus className="h-4 w-4 mr-2" /> Add Restock
              </Button>
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card><CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Stock Value</p>
            <p className="text-xl font-bold mt-1">{formatCurrency(totalValue)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Restock Spending</p>
            <p className="text-xl font-bold mt-1">{formatCurrency(totalRestockSpending)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Low Stock</p>
            <p className="text-xl font-bold mt-1 text-warning">{lowStock.length}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Out of Stock</p>
            <p className="text-xl font-bold mt-1 text-destructive">{outOfStock.length}</p>
          </CardContent></Card>
        </div>

        {/* Add Restock - Select Product Dialog */}
        <Dialog open={addRestockOpen} onOpenChange={setAddRestockOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Select Product to Restock</DialogTitle></DialogHeader>
            <div>
              <Label>Product</Label>
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger><SelectValue placeholder="Choose a product" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {p.sku} (Stock: {getStock(p.id)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddRestockConfirm} disabled={!selectedProductId} className="w-full">
              Continue to Restock
            </Button>
          </DialogContent>
        </Dialog>

        {/* Restock Dialog */}
        <Dialog open={!!restockProduct} onOpenChange={o => { if (!o) { setRestockProduct(null); setRestockQty(0); setRestockCostPerUnit(0); setPaymentMethod('cash'); setBankAccountId(''); setReference(''); setRestockNote(''); setRestockDate(new Date()); } }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Restock: {restockProduct?.name}</DialogTitle></DialogHeader>
            <p className="text-xs text-muted-foreground">Current stock: <span className="font-semibold text-foreground">{restockProduct ? getStock(restockProduct.id) : 0}</span> · Default cost price: <span className="font-semibold text-foreground">{formatCurrency(Number(restockProduct?.cost_price || 0))}/unit</span></p>
            <p className="text-xs text-muted-foreground">Available business money: <span className={`font-semibold ${availableCash < 0 ? 'text-destructive' : 'text-primary'}`}>{formatCurrency(availableCash)}</span></p>
            <div className="grid gap-3">
              <div>
                <Label>Restock Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !restockDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {restockDate ? format(restockDate, 'PPP') : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={restockDate} onSelect={d => d && setRestockDate(d)} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Quantity to Add</Label><Input type="number" min={1} value={restockQty || ''} onChange={e => setRestockQty(Number(e.target.value))} /></div>
                <div><Label>Cost Price / Unit (GH₵)</Label><Input type="number" min={0} step="0.01" value={restockCostPerUnit || ''} onChange={e => setRestockCostPerUnit(Number(e.target.value))} /></div>
              </div>
              <div>
                <Label>Total Cost</Label>
                <Input disabled value={formatCurrency(restockQty * restockCostPerUnit)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="mobile_money">Mobile Money</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Bank / Account</Label>
                  <Select value={bankAccountId} onValueChange={setBankAccountId}>
                    <SelectTrigger><SelectValue placeholder="Select (optional)" /></SelectTrigger>
                    <SelectContent>
                      {banks.map(b => <SelectItem key={b.id} value={b.id}>{b.bank_name} — {b.account_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Reference</Label><Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Transaction ref" /></div>
              <div><Label>Note</Label><Textarea value={restockNote} onChange={e => setRestockNote(e.target.value)} rows={2} placeholder="Optional note" /></div>
            </div>
            <Button onClick={handleRestock} disabled={loading || restockQty <= 0} className="w-full">
              {loading ? 'Processing...' : `Restock & Deduct ${formatCurrency(restockQty * restockCostPerUnit)}`}
            </Button>
          </DialogContent>
        </Dialog>

        {/* Edit Restock Dialog */}
        <Dialog open={!!editRestock} onOpenChange={o => { if (!o) setEditRestock(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Edit Restock: {editRestock?.product_name}</DialogTitle></DialogHeader>
            <p className="text-xs text-muted-foreground">Original qty: <span className="font-semibold text-foreground">{editRestock?.quantity_added}</span> · Cost/unit: <span className="font-semibold text-foreground">{formatCurrency(Number(editRestock?.cost_price_per_unit || 0))}</span></p>
            <div className="grid gap-3">
              <div><Label>New Quantity</Label><Input type="number" min={1} value={editQty || ''} onChange={e => setEditQty(Number(e.target.value))} /></div>
              <div><Label>New Total Cost</Label><Input disabled value={formatCurrency(editQty * Number(editRestock?.cost_price_per_unit || 0))} /></div>
              <div><Label>Note</Label><Textarea value={editNote} onChange={e => setEditNote(e.target.value)} rows={2} /></div>
            </div>
            <Button onClick={handleEditRestock} disabled={loading || editQty <= 0} className="w-full">
              {loading ? 'Saving...' : 'Update Restock'}
            </Button>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteRestock} onOpenChange={o => { if (!o) setDeleteRestock(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Delete Restock</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this restock record for <span className="font-semibold text-foreground">{deleteRestock?.product_name}</span> ({deleteRestock?.quantity_added} units, {formatCurrency(Number(deleteRestock?.total_cost || 0))})?
            </p>
            <p className="text-xs text-warning">This action will reverse the stock and financial impact.</p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteRestock(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteRestock} disabled={deleteLoading}>
                {deleteLoading ? 'Deleting...' : 'Delete & Reverse'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Tabs */}
        <Tabs defaultValue="stock">
          <TabsList>
            <TabsTrigger value="stock">Stock Levels</TabsTrigger>
            <TabsTrigger value="breakdown">Stock Breakdown</TabsTrigger>
            <TabsTrigger value="restocks">Restocks ({activeRestocks.length})</TabsTrigger>
          </TabsList>

          {/* Stock Levels Tab */}
          <TabsContent value="stock" className="space-y-4">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search inventory..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Stock Levels</CardTitle></CardHeader>
              <CardContent className="p-0">
                {filtered.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>Sizes</TableHead>
                          <TableHead>Colors</TableHead>
                          <TableHead>In Stock</TableHead>
                          <TableHead>Reorder At</TableHead>
                          <TableHead>Status</TableHead>
                          {isAdmin && <TableHead></TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map(p => {
                          const stock = getStock(p.id);
                          return (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium">{p.name}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{p.sku}</TableCell>
                              <TableCell className="text-xs">{(p.sizes || []).join(', ') || '—'}</TableCell>
                              <TableCell className="text-xs">{(p.colors || []).join(', ') || '—'}</TableCell>
                              <TableCell className="font-semibold">{stock}</TableCell>
                              <TableCell>{p.reorder_level}</TableCell>
                              <TableCell>
                                {stock === 0 ? (
                                  <Badge variant="destructive" className="text-xs">Out of Stock</Badge>
                                ) : stock <= p.reorder_level ? (
                                  <Badge variant="outline" className="text-xs border-warning text-warning"><AlertTriangle className="h-3 w-3 mr-1" />Low</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs border-success text-success">In Stock</Badge>
                                )}
                              </TableCell>
                              {isAdmin && (
                                <TableCell>
                                  <Button variant="outline" size="sm" className="text-xs" onClick={() => openRestockForProduct(p)}>
                                    <PackagePlus className="h-3.5 w-3.5 mr-1" /> Restock
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <EmptyState icon={<Boxes className="h-7 w-7 text-muted-foreground" />} title="No inventory data" description="Add products first, then restock them here." />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Stock Breakdown Tab */}
          <TabsContent value="breakdown" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Stock Breakdown (Restocked − Sold = Current Stock)</CardTitle></CardHeader>
              <CardContent className="p-0">
                {products.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead className="text-center">Total Restocked</TableHead>
                          <TableHead className="text-center">Total Sold</TableHead>
                          <TableHead className="text-center">Current Stock</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {products.map(p => {
                          const entry = stockMap[p.id] || { restocked: 0, sold: 0 };
                          const calculatedStock = Math.max(0, entry.restocked - entry.sold);
                          return (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium">{p.name}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{p.sku}</TableCell>
                              <TableCell className="text-center font-semibold text-primary">{entry.restocked}</TableCell>
                              <TableCell className="text-center font-semibold text-destructive">{entry.sold}</TableCell>
                              <TableCell className="text-center font-bold">{calculatedStock}</TableCell>
                              <TableCell>
                                {calculatedStock === 0 ? (
                                  <Badge variant="destructive" className="text-xs">Out of Stock</Badge>
                                ) : calculatedStock <= p.reorder_level ? (
                                  <Badge variant="outline" className="text-xs border-warning text-warning"><AlertTriangle className="h-3 w-3 mr-1" />Low</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs border-success text-success">In Stock</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <EmptyState icon={<Boxes className="h-7 w-7 text-muted-foreground" />} title="No products" description="Add products to see stock breakdown." />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Restocks Tab */}
          <TabsContent value="restocks" className="space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="relative w-full sm:w-60">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by product or SKU..." value={restockSearch} onChange={e => setRestockSearch(e.target.value)} className="pl-9" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="restock-from" className="text-[10px] uppercase tracking-wider text-muted-foreground">From</Label>
                <Input id="restock-from" type="date" value={restockDateFrom} onChange={e => setRestockDateFrom(e.target.value)} className="w-40" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="restock-to" className="text-[10px] uppercase tracking-wider text-muted-foreground">To</Label>
                <Input id="restock-to" type="date" value={restockDateTo} onChange={e => setRestockDateTo(e.target.value)} className="w-40" />
              </div>
              <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Supplier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterPayment} onValueChange={setFilterPayment}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Payment" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payments</SelectItem>
                  {paymentMethods.map(m => <SelectItem key={m} value={m}>{m.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterBank} onValueChange={setFilterBank}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Bank" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Banks</SelectItem>
                  {banks.map(b => <SelectItem key={b.id} value={b.id}>{b.bank_name} — {b.account_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sortOrder} onValueChange={v => setSortOrder(v as any)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Restock History</CardTitle></CardHeader>
              <CardContent className="p-0">
                {filteredRestocks.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead>Qty Added</TableHead>
                          <TableHead>Cost/Unit</TableHead>
                          <TableHead>Total Cost</TableHead>
                          <TableHead>Payment</TableHead>
                          <TableHead>Recorded By</TableHead>
                          <TableHead>Status</TableHead>
                          {isAdmin && <TableHead></TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRestocks.map(r => (
                          <TableRow key={r.id}>
                            <TableCell className="text-xs">{new Date(r.restock_date).toLocaleDateString()}</TableCell>
                            <TableCell className="font-medium">{r.product_name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{r.sku}</TableCell>
                            <TableCell className="text-xs">{r.supplier || '—'}</TableCell>
                            <TableCell className="font-semibold">{r.quantity_added}</TableCell>
                            <TableCell>{formatCurrency(Number(r.cost_price_per_unit))}</TableCell>
                            <TableCell className="font-semibold">{formatCurrency(Number(r.total_cost))}</TableCell>
                            <TableCell className="text-xs capitalize">{r.payment_method.replace('_', ' ')}</TableCell>
                            <TableCell className="text-xs">{r.recorded_by_name || '—'}</TableCell>
                            <TableCell>{statusBadge(r.status)}</TableCell>
                            {isAdmin && (
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditRestock(r); setEditQty(r.quantity_added); setEditNote(r.note || ''); }}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteRestock(r)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <EmptyState icon={<PackagePlus className="h-7 w-7 text-muted-foreground" />} title="No restock records" description="Restock history will appear here once you restock products." />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
