import { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { formatCurrency, PAYMENT_METHODS } from '@/lib/constants';
import { buildSaleDocumentSnapshot, normalizeSaleDocument, saleDocumentLabel, type SaleDocumentKind, type SaleDocumentRecord } from '@/lib/sale-documents';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, ShoppingCart, Trash2, Eye, Info, Pencil, FileText, ReceiptText } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SaleDocumentViewerDialog } from '@/components/sales/SaleDocumentViewerDialog';
import {
  deleteStockMovementsBySourceCompat,
  insertStockMovementCompat,
  logSupabaseError,
} from '@/lib/workspace';

export default function SalesPage() {
  const { user, displayName, isAdmin, isManager } = useAuth();
  const { businessId, business } = useBusiness();
  const { toast } = useToast();
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [saleItems, setSaleItems] = useState<Record<string, any[]>>({});
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [activeDocument, setActiveDocument] = useState<SaleDocumentRecord | null>(null);
  const [documentBusyKey, setDocumentBusyKey] = useState<string | null>(null);

  // Edit state
  const [editSaleId, setEditSaleId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');

  // Form state (shared for new + edit)
  const [productId, setProductId] = useState('');
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountPaid, setAmountPaid] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [overridePrice, setOverridePrice] = useState<number | null>(null);
  const [priceNote, setPriceNote] = useState('');
  const [saleNotes, setSaleNotes] = useState('');

  // For edit: track original values
  const [editOriginal, setEditOriginal] = useState<{ productId: string; quantity: number } | null>(null);

  const selectedProduct = allProducts.find(p => p.id === productId);
  const defaultPrice = selectedProduct ? Number(selectedProduct.selling_price) : 0;
  const unitPrice = overridePrice !== null ? overridePrice : defaultPrice;
  const costPrice = selectedProduct ? Number(selectedProduct.cost_price) : 0;
  const subtotal = unitPrice * quantity;
  const total = Math.max(0, subtotal - discount);
  const balance = Math.max(0, total - amountPaid);
  const profit = (unitPrice - costPrice) * quantity - discount;
  const paymentStatus = balance <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';
  const isPriceOverridden = overridePrice !== null && overridePrice !== defaultPrice;
  const canOverridePrice = isAdmin || isManager;

  useEffect(() => {
    fetchData();
    const channel = supabase.channel('sales-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, fetchSales)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, fetchAllProducts)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [historyDateFrom, historyDateTo]);

  const fetchAllProducts = async () => {
    const { data } = await supabase.from('products').select('*').eq('is_archived', false).order('name');
    setAllProducts(data || []);
    setProducts((data || []).filter((p: any) => p.quantity > 0));
  };

  const fetchSales = async () => {
    const { data } = await supabase.from('sales').select('*').order('sale_date', { ascending: false }).limit(50);
    setSales(data || []);
  };

  const fetchSaleItems = async (saleId: string) => {
    const { data } = await supabase.from('sale_items').select('*').eq('sale_id', saleId);
    setSaleItems(prev => ({ ...prev, [saleId]: data || [] }));
    return data || [];
  };

  const fetchData = async () => {
    await Promise.all([fetchAllProducts(), fetchSales()]);
  };

  const resetForm = () => {
    setProductId(''); setSize(''); setColor(''); setQuantity(1);
    setDiscount(0); setPaymentMethod('cash'); setAmountPaid(0);
    setCustomerName(''); setCustomerPhone('');
    setSaleDate(new Date().toISOString().slice(0, 10));
    setDueDate('');
    setOverridePrice(null); setPriceNote(''); setSaleNotes('');
    setEditSaleId(null); setEditOriginal(null);
  };

  const createSaleMovement = async ({
    saleItemId,
    product,
    soldQuantity,
    unitCost,
    soldPrice,
    note,
  }: {
    saleItemId: string;
    product: any;
    soldQuantity: number;
    unitCost: number;
    soldPrice: number;
    note: string;
  }) => {
    if (!businessId || !user) return;
    const quantityAfter = Math.max(0, Number(product.quantity ?? 0) - soldQuantity);
    const result = await insertStockMovementCompat({
      business_id: businessId,
      product_id: product.id,
      movement_type: 'sale',
      quantity_change: soldQuantity * -1,
      quantity_after: quantityAfter,
      unit_cost: unitCost,
      unit_price: soldPrice,
      source_table: 'sale_items',
      source_id: saleItemId,
      note,
      created_by: user.id,
      created_by_name: displayName || user.email || '',
      movement_date: new Date(saleDate).toISOString(),
    });
    if (result.skipped) {
      logSupabaseError('sales.createSaleMovementSkipped', new Error('stock_movements table unavailable'), {
        productId: product.id,
        saleItemId,
      });
    }
  };

  const handleProductChange = (v: string) => {
    setProductId(v);
    setSize(''); setColor('');
    setOverridePrice(null); setPriceNote('');
  };

  // Open edit dialog
  const handleOpenEdit = async (sale: any) => {
    const items = await fetchSaleItems(sale.id);
    const item = items[0]; // single-item sale
    if (!item) { toast({ title: 'Cannot load sale items', variant: 'destructive' }); return; }

    setEditSaleId(sale.id);
    setProductId(item.product_id || '');
    setSize(item.size || '');
    setColor(item.color || '');
    setQuantity(item.quantity);
    setDiscount(Number(sale.discount));
    setPaymentMethod(sale.payment_method);
    setAmountPaid(Number(sale.amount_paid));
    setCustomerName(sale.customer_name || '');
    setCustomerPhone(sale.customer_phone || '');
    setSaleDate(new Date(sale.sale_date).toISOString().slice(0, 10));
    setDueDate(sale.due_date ? new Date(sale.due_date).toISOString().slice(0, 10) : '');
    setSaleNotes(sale.notes || '');

    const dp = Number(item.default_price);
    const up = Number(item.unit_price);
    if (dp > 0 && up !== dp) {
      setOverridePrice(up);
    } else {
      setOverridePrice(null);
    }
    setPriceNote(item.price_note || '');

    setEditOriginal({ productId: item.product_id || '', quantity: item.quantity });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !user) return;

    if (editSaleId) {
      await handleSaveEdit();
    } else {
      await handleNewSale();
    }
  };

  const handleNewSale = async () => {
    if (!selectedProduct || !user || !businessId) return;
    if (quantity > Number(selectedProduct.quantity ?? 0)) {
      toast({
        title: 'Not enough stock',
        description: `Only ${selectedProduct.quantity} unit(s) of ${selectedProduct.name} are available.`,
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    try {
      const { data: sale, error: saleErr } = await supabase.from('sales').insert({
        business_id: businessId,
        sale_date: new Date(saleDate).toISOString(),
        customer_name: customerName || 'Walk-in',
        customer_phone: customerPhone,
        staff_id: user.id,
        staff_name: displayName,
        subtotal, discount, total,
        amount_paid: amountPaid, balance,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        due_date: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : null,
        status: 'completed',
        sale_channel: 'pos',
        notes: saleNotes,
      }).select().single();
      if (saleErr) throw saleErr;

      const { data: saleItem, error: itemErr } = await supabase.from('sale_items').insert({
        business_id: businessId,
        sale_id: sale.id,
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        sku: selectedProduct.sku,
        size, color, quantity,
        unit_price: unitPrice,
        cost_price: costPrice,
        line_total: subtotal,
        default_price: defaultPrice,
        price_note: isPriceOverridden ? priceNote : '',
      }).select().single();
      if (itemErr) throw itemErr;

      await createSaleMovement({
        saleItemId: saleItem.id,
        product: selectedProduct,
        soldQuantity: quantity,
        unitCost: costPrice,
        soldPrice: unitPrice,
        note: saleNotes || 'POS sale',
      });

      if (customerName && customerName !== 'Walk-in') {
        const { data: existing } = await supabase.from('customers').select('id').eq('name', customerName).maybeSingle();
        if (!existing) {
          await supabase.from('customers').insert({ name: customerName, phone: customerPhone, business_id: businessId });
        }
      }

      toast({ title: 'Sale recorded!', description: `${selectedProduct.name} — ${formatCurrency(total)}` });
      resetForm(); setOpen(false); fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  const handleSaveEdit = async () => {
    if (!selectedProduct || !user || !editSaleId || !editOriginal) return;
    setEditLoading(true);
    try {
      // Stock correction logic
      const oldProductId = editOriginal.productId;
      const oldQty = editOriginal.quantity;
      const newProductId = selectedProduct.id;
      const newQty = quantity;

      if (oldProductId === newProductId) {
        // Same product — check stock for increase
        const qtyDiff = newQty - oldQty;
        if (qtyDiff > 0) {
          const prod = allProducts.find(p => p.id === newProductId);
          if (prod && prod.quantity < qtyDiff) {
            toast({ title: 'Insufficient stock for this update', description: `Only ${prod.quantity} available to add.`, variant: 'destructive' });
            setEditLoading(false);
            return;
          }
        }
      } else {
        // Different product — check new product has enough stock
        const newProd = allProducts.find(p => p.id === newProductId);
        if (newProd && newProd.quantity < newQty) {
          toast({ title: 'Insufficient stock for this update', description: `${newProd.name} only has ${newProd.quantity} in stock.`, variant: 'destructive' });
          setEditLoading(false);
          return;
        }
      }

      // Build previous values for audit
      const existingItems = saleItems[editSaleId] || [];
      const oldItem = existingItems[0];
      const oldSale = sales.find(s => s.id === editSaleId);
      const prevValues = oldSale ? `Product: ${oldItem?.product_name}, Qty: ${oldQty}, Price: ${oldItem?.unit_price}, Total: ${oldSale.total}, Discount: ${oldSale.discount}` : '';

      // 1. Delete old sale_items (triggers stock restore)
      const priorIds = existingItems.map((item: any) => item.id).filter(Boolean);
      if (priorIds.length > 0) {
        await deleteStockMovementsBySourceCompat(priorIds);
      }
      await supabase.from('sale_items').delete().eq('sale_id', editSaleId);

      // 2. Update sale record
      const { error: saleErr } = await supabase.from('sales').update({
        sale_date: new Date(saleDate).toISOString(),
        customer_name: customerName || 'Walk-in',
        customer_phone: customerPhone,
        subtotal, discount, total,
        amount_paid: amountPaid, balance,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        due_date: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : null,
        status: 'completed',
        sale_channel: 'pos',
        notes: saleNotes,
      }).eq('id', editSaleId);
      if (saleErr) throw saleErr;

      // 3. Insert new sale_items (triggers stock deduction)
      const { data: saleItem, error: itemErr } = await supabase.from('sale_items').insert({
        business_id: businessId!,
        sale_id: editSaleId,
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        sku: selectedProduct.sku,
        size, color, quantity: newQty,
        unit_price: unitPrice,
        cost_price: costPrice,
        line_total: subtotal,
        default_price: defaultPrice,
        price_note: isPriceOverridden ? priceNote : '',
      }).select().single();
      if (itemErr) throw itemErr;

      await createSaleMovement({
        saleItemId: saleItem.id,
        product: selectedProduct,
        soldQuantity: newQty,
        unitCost: costPrice,
        soldPrice: unitPrice,
        note: saleNotes || 'Edited POS sale',
      });

      // 4. Audit log
      const newValues = `Product: ${selectedProduct.name}, Qty: ${newQty}, Price: ${unitPrice}, Total: ${total}, Discount: ${discount}`;
      await supabase.from('audit_log').insert({
        action: 'sale_edited',
        details: `Previous: [${prevValues}] → New: [${newValues}]`,
        performed_by: user.id,
        performed_by_name: displayName || user.email || '',
      });

      toast({ title: 'Sales transaction updated successfully' });
      resetForm(); setOpen(false);
      setSaleItems(prev => { const next = { ...prev }; delete next[editSaleId]; return next; });
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error updating sale', description: err.message, variant: 'destructive' });
    } finally { setEditLoading(false); }
  };

  const handleDeleteSale = async (saleId: string) => {
    setDeleting(true);
    try {
      const existingItems = saleItems[saleId] || await fetchSaleItems(saleId);
      const sourceIds = existingItems.map((item: any) => item.id).filter(Boolean);
      if (sourceIds.length > 0) {
        await deleteStockMovementsBySourceCompat(sourceIds);
      }
      await supabase.from('sale_items').delete().eq('sale_id', saleId);
      await supabase.from('sales').delete().eq('id', saleId);
      toast({ title: 'Sale deleted successfully', description: 'Stock has been restored automatically.' });
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error deleting sale', description: err.message, variant: 'destructive' });
    } finally { setDeleting(false); setDeleteId(null); }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      for (const saleId of selectedIds) {
        const existingItems = saleItems[saleId] || await fetchSaleItems(saleId);
        const sourceIds = existingItems.map((item: any) => item.id).filter(Boolean);
        if (sourceIds.length > 0) {
          await deleteStockMovementsBySourceCompat(sourceIds);
        }
        await supabase.from('sale_items').delete().eq('sale_id', saleId);
        await supabase.from('sales').delete().eq('id', saleId);
      }
      toast({ title: `${selectedIds.size} sale(s) deleted`, description: 'Stock has been restored for all deleted sales.' });
      setSelectedIds(new Set()); fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally { setDeleting(false); setBulkDeleteOpen(false); }
  };

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      if (historyDateFrom && new Date(sale.sale_date) < new Date(`${historyDateFrom}T00:00:00`)) return false;
      if (historyDateTo && new Date(sale.sale_date) > new Date(`${historyDateTo}T23:59:59`)) return false;
      return true;
    });
  }, [sales, historyDateFrom, historyDateTo]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === filteredSales.length ? new Set() : new Set(filteredSales.map(s => s.id)));
  };

  const detailSale = sales.find(s => s.id === detailSaleId);
  const detailItems = detailSaleId ? saleItems[detailSaleId] || [] : [];
  // For the form, show all products when editing (including 0-stock), only in-stock for new
  const formProducts = editSaleId ? allProducts : products;

  const openDocument = (document: SaleDocumentRecord) => {
    setActiveDocument(document);
    setDocumentOpen(true);
  };

  const generateDocument = async (sale: any, kind: SaleDocumentKind) => {
    if (!user || !businessId || !business) return;
    if (kind === 'receipt' && sale.payment_status !== 'paid') {
      toast({
        title: 'Receipt unavailable',
        description: 'Receipts can only be issued for paid sales.',
        variant: 'destructive',
      });
      return;
    }

    const busyKey = `${sale.id}:${kind}`;
    setDocumentBusyKey(busyKey);
    try {
      const items = saleItems[sale.id] ?? await fetchSaleItems(sale.id);
      const snapshot = buildSaleDocumentSnapshot({
        business,
        sale,
        items,
        issuedBy: {
          name: displayName || sale.staff_name || user.email || 'SikaFlow User',
          email: user.email,
        },
      });

      const { data, error } = await supabase
        .from('sale_documents' as any)
        .upsert({
          business_id: businessId,
          sale_id: sale.id,
          kind,
          sale_date: sale.sale_date,
          payment_status: sale.payment_status,
          amount_ghs: Number(sale.total),
          amount_paid_ghs: Number(sale.amount_paid),
          balance_ghs: Number(sale.balance),
          customer_name: sale.customer_name || 'Walk-in',
          customer_phone: sale.customer_phone || '',
          seller_name: sale.staff_name || displayName || user.email || '',
          issued_by: user.id,
          snapshot,
        }, { onConflict: 'sale_id,kind' })
        .select('*')
        .single();

      if (error) throw error;

      const document = normalizeSaleDocument(data);
      setActiveDocument(document);
      setDocumentOpen(true);
      toast({
        title: `${saleDocumentLabel(kind)} ready`,
        description: `${document.document_number} is ready to view, print, or download.`,
      });
    } catch (error: any) {
      toast({
        title: `Could not create ${saleDocumentLabel(kind).toLowerCase()}`,
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setDocumentBusyKey(null);
    }
  };

  return (
    <AppLayout title="Sales Entry">
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Record new sales and view transaction history</p>
          <div className="flex gap-2">
            {isAdmin && selectedIds.size > 0 && (
              <Button variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" />Delete Selected ({selectedIds.size})
              </Button>
            )}
            <Button onClick={() => { resetForm(); setOpen(true); }}><Plus className="h-4 w-4 mr-2" /> New Sale</Button>
          </div>
        </div>

        {/* New/Edit Sale Dialog */}
        <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) resetForm(); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editSaleId ? 'Edit Sale' : 'Record Sale'}</DialogTitle>
              {editSaleId && <Badge variant="outline" className="w-fit text-[10px]">Editing Transaction</Badge>}
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Product</Label>
                <Select value={productId} onValueChange={handleProductChange}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>
                    {formProducts.length === 0 && (
                      <div className="p-3 text-sm text-muted-foreground text-center">No products available.</div>
                    )}
                    {formProducts.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — {formatCurrency(Number(p.selling_price))} ({p.quantity} in stock)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedProduct && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {(selectedProduct.sizes || []).length > 0 && (
                      <div>
                        <Label>Size</Label>
                        <Select value={size} onValueChange={setSize}>
                          <SelectTrigger><SelectValue placeholder="Size" /></SelectTrigger>
                          <SelectContent>
                            {(selectedProduct.sizes || []).map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {(selectedProduct.colors || []).length > 0 && (
                      <div>
                        <Label>Color</Label>
                        <Select value={color} onValueChange={setColor}>
                          <SelectTrigger><SelectValue placeholder="Color" /></SelectTrigger>
                          <SelectContent>
                            {(selectedProduct.colors || []).map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* Flexible Pricing */}
                  <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Default Price</Label>
                      <span className="text-sm font-medium">{formatCurrency(defaultPrice)}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Label>Selling Price for this Sale</Label>
                        {isPriceOverridden && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/50 text-primary">Custom Price</Badge>
                        )}
                      </div>
                      {canOverridePrice ? (
                        <Input type="number" min={0} step="0.01"
                          value={overridePrice !== null ? overridePrice : defaultPrice}
                          onChange={e => { const val = Number(e.target.value); setOverridePrice(val === defaultPrice ? null : val); }}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <Input type="number" value={defaultPrice} disabled />
                          <TooltipProvider><Tooltip><TooltipTrigger asChild><Info className="h-4 w-4 text-muted-foreground shrink-0" /></TooltipTrigger>
                            <TooltipContent>Only Admin or Manager can override prices</TooltipContent></Tooltip></TooltipProvider>
                        </div>
                      )}
                    </div>
                    {isPriceOverridden && (
                      <div>
                        <Label className="text-xs">Reason for price change</Label>
                        <Input value={priceNote} onChange={e => setPriceNote(e.target.value)} placeholder="e.g. VIP customer, Special markup" />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Quantity</Label><Input type="number" min={1} value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></div>
                    <div><Label>Discount (GH₵)</Label><Input type="number" min={0} value={discount} onChange={e => setDiscount(Number(e.target.value))} /></div>
                  </div>
                </>
              )}

              <div>
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><Label>Amount Paid (GH₵)</Label><Input type="number" min={0} value={amountPaid} onChange={e => setAmountPaid(Number(e.target.value))} /></div>
                <div><Label>Sale Date</Label><Input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} /></div>
              </div>

              {paymentStatus !== 'paid' && (
                <div>
                  <Label>Due Date</Label>
                  <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div><Label>Customer Name</Label><Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Walk-in" /></div>
                <div><Label>Phone</Label><Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} /></div>
              </div>

              <div>
                <Label>Transaction Note</Label>
                <Input value={saleNotes} onChange={e => setSaleNotes(e.target.value)} placeholder="Optional note" />
              </div>

              <Card className="bg-muted/50">
                <CardContent className="p-4 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Unit Price {isPriceOverridden && <span className="text-primary text-[10px]">(custom)</span>}</span>
                    <span>{formatCurrency(unitPrice)}</span>
                  </div>
                  <div className="flex justify-between"><span>Subtotal ({quantity}×)</span><span className="font-semibold">{formatCurrency(subtotal)}</span></div>
                  <div className="flex justify-between"><span>Discount</span><span>-{formatCurrency(discount)}</span></div>
                  <div className="flex justify-between font-bold text-base border-t pt-2 mt-2"><span>Total</span><span>{formatCurrency(total)}</span></div>
                  <div className="flex justify-between"><span>Balance Due</span><span className="text-destructive font-semibold">{formatCurrency(balance)}</span></div>
                  <div className="flex justify-between"><span>Profit</span><span className={profit >= 0 ? 'text-success' : 'text-destructive'}>{formatCurrency(profit)}</span></div>
                </CardContent>
              </Card>

              <Button type="submit" className="w-full" disabled={loading || editLoading || !productId}>
                {editLoading ? 'Saving Changes...' : loading ? 'Saving...' : editSaleId ? 'Save Changes' : 'Record Sale'}
              </Button>
              {editSaleId && (
                <Button type="button" variant="outline" className="w-full" onClick={() => { resetForm(); setOpen(false); }}>
                  Cancel
                </Button>
              )}
            </form>
          </DialogContent>
        </Dialog>

        {/* Sale Detail Dialog */}
        <Dialog open={!!detailSaleId} onOpenChange={o => { if (!o) setDetailSaleId(null); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Sale Details</DialogTitle></DialogHeader>
            {detailSale && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Date:</span> {new Date(detailSale.sale_date).toLocaleDateString()}</div>
                  <div><span className="text-muted-foreground">Customer:</span> {detailSale.customer_name || 'Walk-in'}</div>
                  <div><span className="text-muted-foreground">Total:</span> <span className="font-bold">{formatCurrency(Number(detailSale.total))}</span></div>
                  <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={detailSale.payment_status} /></div>
                  {detailSale.notes && <div className="col-span-2"><span className="text-muted-foreground">Note:</span> {detailSale.notes}</div>}
                </div>
                {detailItems.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Default</TableHead>
                        <TableHead>Sold At</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailItems.map((item: any) => {
                        const wasOverridden = Number(item.default_price) > 0 && Number(item.unit_price) !== Number(item.default_price);
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium text-xs">{item.product_name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{Number(item.default_price) > 0 ? formatCurrency(Number(item.default_price)) : '—'}</TableCell>
                            <TableCell className="text-xs">
                              {formatCurrency(Number(item.unit_price))}
                              {wasOverridden && <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0 border-primary/50 text-primary">Custom</Badge>}
                            </TableCell>
                            <TableCell className="text-xs">{item.quantity}</TableCell>
                            <TableCell className="text-xs font-semibold">{formatCurrency(Number(item.line_total))}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[100px] truncate">{item.price_note || '—'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Loading items...</p>
                )}

              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Dialogs */}
        <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Sale</AlertDialogTitle>
              <AlertDialogDescription>Are you sure? Stock will be restored automatically.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteId && handleDeleteSale(deleteId)} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? 'Deleting...' : 'Delete Sale'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedIds.size} Sale(s)</AlertDialogTitle>
              <AlertDialogDescription>Are you sure? Stock will be restored for all deleted items.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? 'Deleting...' : `Delete ${selectedIds.size} Sale(s)`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Sales History */}
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <CardTitle className="text-base">Sales History</CardTitle>
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1">
                <Label htmlFor="sales-from" className="text-[10px] uppercase tracking-wider text-muted-foreground">From</Label>
                <Input id="sales-from" type="date" value={historyDateFrom} onChange={e => setHistoryDateFrom(e.target.value)} className="w-40" />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="sales-to" className="text-[10px] uppercase tracking-wider text-muted-foreground">To</Label>
                <Input id="sales-to" type="date" value={historyDateTo} onChange={e => setHistoryDateTo(e.target.value)} className="w-40" />
              </div>
              {(historyDateFrom || historyDateTo) && (
                <Button type="button" variant="ghost" size="sm" onClick={() => { setHistoryDateFrom(''); setHistoryDateTo(''); }}>
                  Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {filteredSales.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {isAdmin && (
                        <TableHead className="w-10">
                          <Checkbox checked={selectedIds.size === filteredSales.length && filteredSales.length > 0} onCheckedChange={toggleSelectAll} />
                        </TableHead>
                      )}
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Staff</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSales.map(sale => (
                      <TableRow key={sale.id}>
                        {isAdmin && (
                          <TableCell>
                            <Checkbox checked={selectedIds.has(sale.id)} onCheckedChange={() => toggleSelect(sale.id)} />
                          </TableCell>
                        )}
                        <TableCell className="text-xs">{new Date(sale.sale_date).toLocaleDateString()}</TableCell>
                        <TableCell>{sale.customer_name || 'Walk-in'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{sale.staff_name || '—'}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(Number(sale.total))}</TableCell>
                        <TableCell>{formatCurrency(Number(sale.amount_paid))}</TableCell>
                        <TableCell className={Number(sale.balance) > 0 ? 'text-destructive font-semibold' : ''}>{formatCurrency(Number(sale.balance))}</TableCell>
                        <TableCell className="capitalize text-xs">{sale.payment_method?.replace('_', ' ')}</TableCell>
                        <TableCell><StatusBadge status={sale.payment_status} /></TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" onClick={() => { setDetailSaleId(sale.id); fetchSaleItems(sale.id); }} title="View details">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => void generateDocument(sale, 'invoice')}
                                    disabled={documentBusyKey === `${sale.id}:invoice`}
                                    title="Generate invoice"
                                  >
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Generate or open invoice</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => void generateDocument(sale, 'receipt')}
                                      disabled={sale.payment_status !== 'paid' || documentBusyKey === `${sale.id}:receipt`}
                                      title={sale.payment_status === 'paid' ? 'Generate receipt' : 'Receipts need a paid sale'}
                                    >
                                      <ReceiptText className="h-4 w-4" />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {sale.payment_status === 'paid' ? 'Generate or open receipt' : 'Receipt becomes available when the sale is fully paid'}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            {isAdmin && (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(sale)} title="Edit sale">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => setDeleteId(sale.id)} title="Delete sale">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState icon={<ShoppingCart className="h-7 w-7 text-muted-foreground" />} title={sales.length > 0 ? 'No sales in this date range' : 'No sales yet'} description={sales.length > 0 ? 'Clear or adjust the date filter to find older transactions.' : "Click 'New Sale' to record your first transaction."} />
            )}
          </CardContent>
        </Card>

      </div>

      <SaleDocumentViewerDialog open={documentOpen} onOpenChange={setDocumentOpen} document={activeDocument} />
    </AppLayout>
  );
}
