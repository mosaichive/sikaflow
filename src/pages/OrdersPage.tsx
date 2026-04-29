import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, ORDER_STATUSES, PAYMENT_METHODS } from '@/lib/constants';
import { ClipboardList, Plus, Truck } from 'lucide-react';
import { loadProductsCompat, logSupabaseError } from '@/lib/workspace';

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  selling_price: number | string;
  cost_price: number | string;
};

type OrderRow = {
  id: string;
  customer_name: string;
  customer_phone: string;
  delivery_location: string;
  subtotal: number | string;
  discount: number | string;
  total: number | string;
  amount_paid: number | string;
  balance: number | string;
  payment_method: string;
  payment_status: string;
  status: string;
  notes: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  created_by: string | null;
  created_by_name: string | null;
  order_date: string;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number | string;
  cost_price: number | string;
  line_total: number | string;
};

type DraftOrderItem = {
  id: string;
  product_id: string;
  quantity: string;
};

function makeDraftItem(): DraftOrderItem {
  return { id: crypto.randomUUID(), product_id: '', quantity: '1' };
}

export default function OrdersPage() {
  const { user, displayName, isAdmin, isManager, isSalesperson, isDistributor, role } = useAuth();
  const { businessId } = useBusiness();
  const { toast } = useToast();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItemRow[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orderLines, setOrderLines] = useState<DraftOrderItem[]>([makeDraftItem()]);
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    delivery_location: '',
    discount: '0',
    amount_paid: '0',
    payment_method: PAYMENT_METHODS[0].value,
    notes: '',
    status: 'pending',
    due_date: '',
  });

  const canCreate = isAdmin || isManager || isSalesperson;
  const canManageStatus = isAdmin || isManager || isSalesperson;

  const load = useCallback(async () => {
    const [productsRes, ordersRes, itemsRes] = await Promise.allSettled([
      loadProductsCompat(false, businessId),
      supabase.from('orders' as any).select('*').order('order_date', { ascending: false }),
      supabase.from('order_items' as any).select('*'),
    ]);

    if (productsRes.status === 'fulfilled') {
      setProducts(
        (productsRes.value || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          sku: row.sku,
          quantity: row.quantity,
          selling_price: row.selling_price,
          cost_price: row.cost_price,
        })) as ProductRow[],
      );
    } else {
      logSupabaseError('orders.load.products', productsRes.reason, { businessId });
      setProducts([]);
    }

    setOrders(
      ordersRes.status === 'fulfilled'
        ? ((ordersRes.value.data || []) as OrderRow[])
        : [],
    );
    setOrderItems(
      itemsRes.status === 'fulfilled'
        ? ((itemsRes.value.data || []) as OrderItemRow[])
        : [],
    );

    if (ordersRes.status === 'rejected') logSupabaseError('orders.load.orders', ordersRes.reason, { businessId });
    if (itemsRes.status === 'rejected') logSupabaseError('orders.load.orderItems', itemsRes.reason, { businessId });
  }, [businessId]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel('orders-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => { void load(); })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const visibleOrders = useMemo(() => {
    if (isAdmin || isManager) return orders;
    if (isSalesperson || isDistributor) {
      return orders.filter((order) => order.assigned_to === user?.id || order.created_by === user?.id);
    }
    return orders;
  }, [isAdmin, isDistributor, isManager, isSalesperson, orders, user?.id]);

  const selectedItems = useMemo(() => {
    return orderLines
      .map((line) => {
        const product = products.find((entry) => entry.id === line.product_id);
        if (!product) return null;
        const quantity = Number(line.quantity || 0);
        return {
          ...line,
          product,
          quantity,
          lineTotal: quantity * Number(product.selling_price || 0),
        };
      })
      .filter((entry): entry is DraftOrderItem & { product: ProductRow; quantity: number; lineTotal: number } => !!entry);
  }, [orderLines, products]);

  const subtotal = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.lineTotal, 0),
    [selectedItems],
  );
  const discount = Number(form.discount || 0);
  const total = Math.max(0, subtotal - discount);
  const amountPaid = Number(form.amount_paid || 0);
  const balance = Math.max(0, total - amountPaid);
  const paymentStatus = balance <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';

  const addLine = () => setOrderLines((lines) => [...lines, makeDraftItem()]);
  const removeLine = (id: string) => setOrderLines((lines) => (lines.length === 1 ? lines : lines.filter((line) => line.id !== id)));

  const resetForm = () => {
    setForm({
      customer_name: '',
      customer_phone: '',
      delivery_location: '',
      discount: '0',
      amount_paid: '0',
      payment_method: PAYMENT_METHODS[0].value,
      notes: '',
      status: 'pending',
      due_date: '',
    });
    setOrderLines([makeDraftItem()]);
  };

  const createOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !businessId || !canCreate) return;
    if (selectedItems.length === 0) {
      toast({ title: 'Add at least one product', variant: 'destructive' });
      return;
    }

    for (const item of selectedItems) {
      if (item.quantity <= 0) {
        toast({ title: 'Invalid quantity', description: 'Each order item must be at least 1.', variant: 'destructive' });
        return;
      }
    }

    setSaving(true);

    try {
      const { data: order, error: orderError } = await supabase
        .from('orders' as any)
        .insert({
          business_id: businessId,
          customer_name: form.customer_name || 'Walk-in',
          customer_phone: form.customer_phone,
          delivery_location: form.delivery_location,
          notes: form.notes,
          subtotal,
          discount,
          total,
          amount_paid: amountPaid,
          balance,
          payment_method: form.payment_method,
          payment_status: paymentStatus,
          status: form.status,
          created_by: user.id,
          created_by_name: displayName || user.email || '',
          assigned_to: user.id,
          assigned_to_name: displayName || user.email || '',
          due_date: form.due_date || null,
          order_date: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (orderError) throw orderError;

      const { error: itemsError } = await supabase.from('order_items' as any).insert(
        selectedItems.map((item) => ({
          business_id: businessId,
          order_id: order.id,
          product_id: item.product.id,
          product_name: item.product.name,
          sku: item.product.sku,
          quantity: item.quantity,
          unit_price: item.product.selling_price,
          cost_price: item.product.cost_price,
          line_total: item.lineTotal,
        })),
      );
      if (itemsError) throw itemsError;

      toast({ title: 'Order created', description: 'Track it here until it is delivered.' });
      resetForm();
      setOpen(false);
      void load();
    } catch (error) {
      toast({
        title: 'Could not create order',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const finalizeDeliveredOrder = async (order: OrderRow) => {
    if (!businessId || !user) return;
    const items = orderItems.filter((item) => item.order_id === order.id);
    if (items.length === 0) return;

    for (const item of items) {
      const product = products.find((entry) => entry.id === item.product_id);
      if (!product || Number(product.quantity || 0) < Number(item.quantity || 0)) {
        throw new Error(`Not enough stock to deliver ${item.product_name}.`);
      }
    }

    const existingSale = await supabase.from('sales').select('id').eq('order_id', order.id).maybeSingle();
    if (existingSale.error) throw existingSale.error;
    if (existingSale.data?.id) return;

    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        business_id: businessId,
        sale_date: new Date().toISOString(),
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        staff_id: user.id,
        staff_name: order.assigned_to_name || displayName || user.email || '',
        subtotal: order.subtotal,
        discount: order.discount,
        total: order.total,
        amount_paid: order.amount_paid,
        balance: order.balance,
        payment_method: order.payment_method,
        payment_status: order.payment_status,
        notes: order.notes,
        status: 'delivered',
        sale_channel: 'order',
        due_date: order.due_date || null,
        order_id: order.id,
      })
      .select('id')
      .single();
    if (saleError) throw saleError;

    const { error: saleItemsError } = await supabase.from('sale_items').insert(
      items.map((item) => ({
        business_id: businessId,
        sale_id: sale.id,
        product_id: item.product_id,
        product_name: item.product_name,
        sku: '',
        quantity: item.quantity,
        unit_price: item.unit_price,
        cost_price: item.cost_price,
        line_total: item.line_total,
      })),
    );
    if (saleItemsError) throw saleItemsError;
  };

  const handleStatusChange = async (order: OrderRow, nextStatus: string) => {
    if (!canManageStatus) return;
    try {
      if (nextStatus === 'delivered' && normalizeStatus(order.status) !== 'delivered') {
        await finalizeDeliveredOrder(order);
      }

      const nextPaymentStatus =
        nextStatus === 'cancelled'
          ? order.payment_status
          : normalizeStatus(order.payment_status) === 'unpaid' && order.due_date && new Date(order.due_date).getTime() < Date.now()
            ? 'overdue'
            : order.payment_status;

      const { error } = await supabase
        .from('orders' as any)
        .update({
          status: nextStatus,
          payment_status: nextPaymentStatus,
          delivered_at: nextStatus === 'delivered' ? new Date().toISOString() : null,
        })
        .eq('id', order.id);
      if (error) throw error;

      toast({ title: 'Order updated', description: `Order moved to ${nextStatus.replaceAll('_', ' ')}.` });
      void load();
    } catch (error) {
      toast({
        title: 'Could not update order',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <AppLayout title="Orders">
      <div className="space-y-6">
        <section className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/75 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
            <p className="text-sm text-muted-foreground">
              Track pending, processing, and delivered orders separately from walk-in POS sales. Delivered orders turn into real sales automatically.
            </p>
          </div>
          {canCreate ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Create Order</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>New Order</DialogTitle>
                </DialogHeader>
                <form className="space-y-4" onSubmit={createOrder}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Customer Name</Label>
                      <Input value={form.customer_name} onChange={(event) => setForm((current) => ({ ...current, customer_name: event.target.value }))} placeholder="Walk-in or customer name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number</Label>
                      <Input value={form.customer_phone} onChange={(event) => setForm((current) => ({ ...current, customer_phone: event.target.value }))} placeholder="+233..." />
                    </div>
                    <div className="space-y-2">
                      <Label>Delivery / Pickup Location</Label>
                      <Input value={form.delivery_location} onChange={(event) => setForm((current) => ({ ...current, delivery_location: event.target.value }))} placeholder="Pickup point or delivery address" />
                    </div>
                    <div className="space-y-2">
                      <Label>Due Date</Label>
                      <Input type="date" value={form.due_date} onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))} />
                    </div>
                  </div>

                  <Card className="border-border/70">
                    <CardHeader>
                      <CardTitle>Order Items</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {orderLines.map((line, index) => (
                        <div key={line.id} className="grid gap-3 rounded-2xl border border-border/60 p-3 md:grid-cols-[1.5fr_0.7fr_auto]">
                          <div className="space-y-2">
                            <Label>Product {index + 1}</Label>
                            <Select value={line.product_id} onValueChange={(value) => setOrderLines((rows) => rows.map((row) => row.id === line.id ? { ...row, product_id: value } : row))}>
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
                            <Label>Quantity</Label>
                            <Input type="number" min="1" step="1" value={line.quantity} onChange={(event) => setOrderLines((rows) => rows.map((row) => row.id === line.id ? { ...row, quantity: event.target.value } : row))} />
                          </div>
                          <div className="flex items-end">
                            <Button type="button" variant="outline" onClick={() => removeLine(line.id)}>Remove</Button>
                          </div>
                        </div>
                      ))}
                      <Button type="button" variant="outline" onClick={addLine}>Add another product</Button>
                    </CardContent>
                  </Card>

                  <div className="grid gap-4 md:grid-cols-2">
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
                    <div className="space-y-2">
                      <Label>Starting Status</Label>
                      <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ORDER_STATUSES.filter((status) => status.value !== 'delivered').map((status) => (
                            <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Discount</Label>
                      <Input type="number" min="0" step="0.01" value={form.discount} onChange={(event) => setForm((current) => ({ ...current, discount: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Amount Paid</Label>
                      <Input type="number" min="0" step="0.01" value={form.amount_paid} onChange={(event) => setForm((current) => ({ ...current, amount_paid: event.target.value }))} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Notes</Label>
                      <Textarea rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
                    </div>
                  </div>

                  <div className="grid gap-3 rounded-2xl border border-border/60 p-4 md:grid-cols-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Subtotal</p>
                      <p className="mt-1 text-lg font-semibold">{formatCurrency(subtotal)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Discount</p>
                      <p className="mt-1 text-lg font-semibold">{formatCurrency(discount)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Amount Paid</p>
                      <p className="mt-1 text-lg font-semibold">{formatCurrency(amountPaid)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Balance</p>
                      <p className="mt-1 text-lg font-semibold">{formatCurrency(balance)}</p>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={saving}>
                    {saving ? 'Saving order...' : 'Save Order'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </section>

        <Card className="border-border/70">
          <CardContent className="p-0">
            {visibleOrders.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>{new Date(order.order_date).toLocaleDateString('en-GH')}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{order.customer_name || 'Walk-in'}</p>
                            <p className="text-xs text-muted-foreground">{order.customer_phone || order.delivery_location || 'No contact provided'}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {canManageStatus ? (
                            <Select value={order.status} onValueChange={(value) => void handleStatusChange(order, value)}>
                              <SelectTrigger className="w-[180px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ORDER_STATUSES.map((status) => (
                                  <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            ORDER_STATUSES.find((status) => status.value === order.status)?.label || order.status
                          )}
                        </TableCell>
                        <TableCell>{order.payment_status}</TableCell>
                        <TableCell>{order.assigned_to_name || 'Unassigned'}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(Number(order.total || 0))}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(order.balance || 0))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                icon={<ClipboardList className="h-7 w-7 text-muted-foreground" />}
                title="No orders yet"
                description="Track delivery, pickup, and pending orders here. Orders only count in sales after they are delivered."
                action={canCreate ? <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> Create Order</Button> : undefined}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}
