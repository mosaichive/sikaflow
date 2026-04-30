import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useBusiness } from '@/context/BusinessContext';
import { useAuth } from '@/context/AuthContext';
import { CheckCircle2, PackagePlus } from 'lucide-react';
import { createProductRecord, ensureUserBusinessWorkspace, rememberCachedProduct } from '@/lib/workspace';

interface AddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (product: any) => void;
  /** When true, after creation show a quick prompt to restock immediately */
  offerRestockNext?: boolean;
  /** Called if user chooses "Restock Now" after creation */
  onRestockNow?: (product: any) => void;
}

const empty = {
  name: '', category: '', selling_price: 0, cost_price: 0,
  reorder_level: 5,
};

function autoSku(name: string) {
  const base = (name || 'PRD').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'PRD';
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${base}-${rand}`;
}

export function AddProductDialog({ open, onOpenChange, onCreated, offerRestockNext, onRestockNow }: AddProductDialogProps) {
  const { businessId } = useBusiness();
  const { user, displayName } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [createdProduct, setCreatedProduct] = useState<any | null>(null);

  useEffect(() => {
    if (!open) {
      setForm(empty);
      setCreatedProduct(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: 'Sign in required', variant: 'destructive' });
      return;
    }
    if (!businessId) {
      toast({ title: 'No business selected', variant: 'destructive' });
      return;
    }
    setLoading(true);
    const activeBusinessId = await ensureUserBusinessWorkspace({
      existingBusinessId: businessId,
      user,
      displayName: displayName || user.email || undefined,
      allowCreate: false,
    });
    if (!activeBusinessId) {
      setLoading(false);
      toast({ title: 'Complete setup first', variant: 'destructive' });
      return;
    }
    const payload = {
      business_id: activeBusinessId,
      user_id: user.id,
      name: form.name.trim(),
      sku: autoSku(form.name),
      category: form.category.trim(),
      cost_price: Number(form.cost_price) || 0,
      selling_price: Number(form.selling_price) || 0,
      reorder_level: Number(form.reorder_level) || 0,
      quantity: 0,
    };
    try {
      const created = await createProductRecord(payload);
      const nextProduct = {
        id: created.id,
        ...payload,
      };
      rememberCachedProduct(activeBusinessId, nextProduct);
      setLoading(false);
      toast({ title: 'Product added successfully' });
      onCreated?.(nextProduct);
      if (offerRestockNext) {
        setCreatedProduct(nextProduct);
      } else {
        onOpenChange(false);
      }
    } catch (error: any) {
      setLoading(false);
      toast({ title: 'Error adding product', description: error?.message || 'Please try again.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        {!createdProduct ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PackagePlus className="h-5 w-5 text-primary" /> Add Product
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <Label>Product Name *</Label>
                <Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Category</Label>
                  <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
                </div>
                <div>
                  <Label>Selling Price (GH₵) *</Label>
                  <Input required type="number" min={0} step="0.01" value={form.selling_price}
                    onChange={e => setForm({ ...form, selling_price: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Cost Price (GH₵)</Label>
                  <Input type="number" min={0} step="0.01" value={form.cost_price}
                    onChange={e => setForm({ ...form, cost_price: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <Label>Low Stock Threshold</Label>
                <Input type="number" min={0} value={form.reorder_level}
                  onChange={e => setForm({ ...form, reorder_level: Number(e.target.value) })} />
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                  {loading ? 'Saving...' : 'Save Product'}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <div className="text-center py-6 space-y-4">
            <div className="mx-auto h-14 w-14 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-success" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Product added successfully</h3>
              <p className="text-sm text-muted-foreground mt-1">{createdProduct.name} is ready. Add stock next from Inventory.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Done
              </Button>
              <Button
                onClick={() => {
                  const p = createdProduct;
                  setCreatedProduct(null);
                  onOpenChange(false);
                  onRestockNow?.(p);
                }}
              >
                Add Restock Now
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
