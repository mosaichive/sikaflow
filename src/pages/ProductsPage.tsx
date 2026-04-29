import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/constants';
import { Package, Plus, Search, Pencil, Trash2, ArchiveRestore, Archive } from 'lucide-react';
import {
  createProductRecord,
  ensureUserBusinessWorkspace,
  getErrorMessage,
  insertStockMovementCompat,
  loadProductsCompat,
  logSupabaseError,
  rememberCachedProduct,
  removeCachedProduct,
  updateProductRecord,
} from '@/lib/workspace';

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  cost_price: number | string;
  selling_price: number | string;
  low_stock_threshold?: number | null;
  reorder_level?: number | null;
  image_url?: string | null;
  is_archived?: boolean | null;
};

const emptyForm = {
  name: '',
  category: '',
  sku: '',
  cost_price: '0',
  selling_price: '0',
  quantity: '0',
  low_stock_threshold: '3',
};

function generateSku(name: string) {
  const base = name.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || 'ITEM';
  return `${base}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export default function ProductsPage() {
  const { isAdmin, isManager, user, displayName } = useAuth();
  const { businessId } = useBusiness();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const canManage = isAdmin || isManager;

  const load = useCallback(async () => {
    const data = await loadProductsCompat(showArchived, businessId);
    setRows(data as ProductRow[]);
  }, [businessId, showArchived]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel('products-management')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => { void load(); })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) =>
        [row.name, row.sku, row.category]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [rows, search],
  );

  const openCreate = () => {
    setEditing(null);
    setImageFile(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (row: ProductRow) => {
    setEditing(row);
    setImageFile(null);
    setForm({
      name: row.name,
      category: row.category || '',
      sku: row.sku,
      cost_price: String(row.cost_price ?? 0),
      selling_price: String(row.selling_price ?? 0),
      quantity: String(row.quantity ?? 0),
      low_stock_threshold: String(row.low_stock_threshold ?? row.reorder_level ?? 3),
    });
    setOpen(true);
  };

  const uploadProductImage = async (activeBusinessId: string, productId: string, file: File) => {
    const ext = file.name.split('.').pop() || 'png';
    const path = `${activeBusinessId}/${productId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('product-images').getPublicUrl(path);
    return data.publicUrl;
  };

  const saveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !canManage) return;
    setSaving(true);

    try {
      const activeBusinessId = await ensureUserBusinessWorkspace({
        existingBusinessId: businessId,
        user,
        displayName: displayName || user.email || undefined,
        allowCreate: false,
      });
      if (!activeBusinessId) {
        toast({
          title: 'Complete setup first',
          description: 'Create your business workspace from the setup flow before adding products.',
          variant: 'destructive',
        });
        navigate('/dashboard', { replace: true });
        return;
      }

      const quantity = Math.max(0, Number(form.quantity || 0));
      const lowStockThreshold = Math.max(0, Number(form.low_stock_threshold || 0));
      let imageWarning = '';
      const payload = {
        business_id: activeBusinessId,
        user_id: user.id,
        name: form.name.trim(),
        category: form.category.trim(),
        sku: form.sku.trim() || generateSku(form.name),
        cost_price: Number(form.cost_price || 0),
        selling_price: Number(form.selling_price || 0),
        quantity,
        reorder_level: lowStockThreshold,
        low_stock_threshold: lowStockThreshold,
        is_archived: false,
      };

      if (editing) {
        await updateProductRecord(editing.id, payload);
        let nextImageUrl = editing.image_url ?? null;

        if (imageFile) {
          try {
            const imageUrl = await uploadProductImage(activeBusinessId, editing.id, imageFile);
            nextImageUrl = imageUrl;
            const { error: imageUpdateError } = await supabase
              .from('products')
              .update({ image_url: imageUrl } as never)
              .eq('id', editing.id);
            if (imageUpdateError) throw imageUpdateError;
          } catch (imageError) {
            logSupabaseError('products.edit.imageUpload', imageError, {
              productId: editing.id,
              businessId: activeBusinessId,
            });
            imageWarning = 'The product saved, but the image could not be uploaded.';
          }
        }

        setRows((current) =>
          current.map((row) =>
            row.id === editing.id
              ? {
                  ...row,
                  ...payload,
                  image_url: nextImageUrl,
                }
              : row,
          ),
        );
        rememberCachedProduct(activeBusinessId, {
          id: editing.id,
          ...payload,
          image_url: nextImageUrl,
        });
        toast({ title: 'Product updated', description: imageWarning || undefined });
      } else {
        const created = await createProductRecord(payload);
        let nextImageUrl: string | null = null;

        if (imageFile) {
          try {
            const imageUrl = await uploadProductImage(activeBusinessId, created.id, imageFile);
            nextImageUrl = imageUrl;
            const { error: imageUpdateError } = await supabase
              .from('products')
              .update({ image_url: imageUrl } as never)
              .eq('id', created.id);
            if (imageUpdateError) throw imageUpdateError;
          } catch (imageError) {
            logSupabaseError('products.create.imageUpload', imageError, {
              productId: created.id,
              businessId: activeBusinessId,
            });
            imageWarning = 'The product saved, but the image could not be uploaded.';
          }
        }

        if (quantity > 0) {
          try {
            const movementResult = await insertStockMovementCompat({
              business_id: activeBusinessId,
              product_id: created.id,
              movement_type: 'opening_stock',
              quantity_change: quantity,
              quantity_after: quantity,
              unit_cost: Number(form.cost_price || 0),
              unit_price: Number(form.selling_price || 0),
              note: 'Opening Stock',
              created_by: user.id,
              created_by_name: displayName || user.email || '',
            });
            if (movementResult.skipped) {
              imageWarning = imageWarning || 'The product saved, but inventory history will sync after database updates finish propagating.';
            }
          } catch (movementError) {
            logSupabaseError('products.create.stockMovement', movementError, {
              productId: created.id,
              businessId: activeBusinessId,
            });
            imageWarning = imageWarning || 'The product saved, but opening stock history could not be recorded yet.';
          }
        }

        setRows((current) => {
          const nextRow: ProductRow = {
            id: created.id,
            name: payload.name,
            category: payload.category,
            sku: payload.sku,
            quantity: Number(payload.quantity ?? 0),
            cost_price: Number(payload.cost_price ?? 0),
            selling_price: Number(payload.selling_price ?? 0),
            low_stock_threshold: Number(payload.low_stock_threshold ?? payload.reorder_level ?? 0),
            reorder_level: Number(payload.reorder_level ?? payload.low_stock_threshold ?? 0),
            image_url: nextImageUrl,
            is_archived: false,
          };

          const withoutDuplicate = current.filter((row) => row.id !== nextRow.id);
          return [nextRow, ...withoutDuplicate].sort((left, right) => left.name.localeCompare(right.name));
        });
        rememberCachedProduct(activeBusinessId, {
          id: created.id,
          ...payload,
          image_url: nextImageUrl,
        });
        toast({
          title: 'Product added',
          description: imageWarning || (quantity > 0 ? 'Opening stock was recorded too.' : 'Add stock later from Inventory.'),
        });
      }

      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      setImageFile(null);
      void load();
    } catch (error) {
      logSupabaseError('products.save', error, {
        editingId: editing?.id ?? null,
        businessId,
        userId: user.id,
      });
      toast({
        title: 'Could not save product',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (row: ProductRow) => {
    const { error } = await supabase.from('products').update({ is_archived: !row.is_archived } as never).eq('id', row.id);
    if (error) {
      toast({ title: 'Could not update product', description: error.message, variant: 'destructive' });
      return;
    }
    if (businessId) {
      rememberCachedProduct(businessId, {
        ...row,
        is_archived: !row.is_archived,
      });
    }
    toast({ title: row.is_archived ? 'Product restored' : 'Product archived' });
    void load();
  };

  const deleteProduct = async (id: string) => {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      toast({ title: 'Could not delete product', description: error.message, variant: 'destructive' });
      return;
    }
    if (businessId) {
      removeCachedProduct(businessId, id);
    }
    toast({ title: 'Product deleted' });
    void load();
  };

  return (
    <AppLayout title="Products">
      <div className="space-y-6">
        <section className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/75 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
            <p className="text-sm text-muted-foreground">
              Manage your product catalog, prices, stock thresholds, and archived items. Add stock quantity here if you are introducing a new product with opening stock.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search products..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <Button type="button" variant="outline" onClick={() => setShowArchived((value) => !value)}>
              {showArchived ? 'Hide archived' : 'Show archived'}
            </Button>
            {canManage ? (
              <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add Product</Button>
            ) : null}
          </div>
        </section>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Product' : 'Add Product'}</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={saveProduct}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Product Name</Label>
                  <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>SKU</Label>
                  <Input value={form.sku} onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))} placeholder="Auto-generate if left blank" />
                </div>
                <div className="space-y-2">
                  <Label>Cost Price</Label>
                  <Input type="number" min="0" step="0.01" value={form.cost_price} onChange={(event) => setForm((current) => ({ ...current, cost_price: event.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Selling Price</Label>
                  <Input type="number" min="0" step="0.01" value={form.selling_price} onChange={(event) => setForm((current) => ({ ...current, selling_price: event.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Stock Quantity</Label>
                  <Input type="number" min="0" step="1" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label>Low Stock Threshold</Label>
                  <Input type="number" min="0" step="1" value={form.low_stock_threshold} onChange={(event) => setForm((current) => ({ ...current, low_stock_threshold: event.target.value }))} required />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Product Image (optional)</Label>
                  <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setImageFile(event.target.files?.[0] || null)} />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update Product' : 'Save Product'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Card className="border-border/70">
          <CardContent className="p-0">
            {filteredRows.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Selling</TableHead>
                      <TableHead>Low Stock</TableHead>
                      {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-muted">
                              {row.image_url ? <img src={row.image_url} alt={row.name} className="h-full w-full object-cover" /> : <Package className="h-5 w-5 text-muted-foreground" />}
                            </div>
                            <div>
                              <p className="font-medium">{row.name}</p>
                              <p className="text-xs text-muted-foreground">{row.sku}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{row.category}</TableCell>
                        <TableCell>{row.quantity}</TableCell>
                        <TableCell>{formatCurrency(Number(row.cost_price || 0))}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(Number(row.selling_price || 0))}</TableCell>
                        <TableCell>{row.low_stock_threshold ?? row.reorder_level ?? 0}</TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => void toggleArchive(row)}>
                                {row.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                              </Button>
                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => void deleteProduct(row.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                icon={<Package className="h-7 w-7 text-muted-foreground" />}
                title="No products yet"
                description="Add your first product and opening stock to start selling."
                action={canManage ? <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add Product</Button> : undefined}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
