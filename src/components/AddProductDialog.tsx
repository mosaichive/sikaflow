import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useBusiness } from '@/context/BusinessContext';
import { CheckCircle2, PackagePlus } from 'lucide-react';

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
  name: '', category: '', sku: '', selling_price: 0, cost_price: 0,
  reorder_level: 5, sizes: '', colors: '', description: '',
};

function autoSku(name: string) {
  const base = (name || 'PRD').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'PRD';
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${base}-${rand}`;
}

export function AddProductDialog({ open, onOpenChange, onCreated, offerRestockNext, onRestockNow }: AddProductDialogProps) {
  const { businessId } = useBusiness();
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
    if (!businessId) {
      toast({ title: 'No business selected', variant: 'destructive' });
      return;
    }
    setLoading(true);
    const sku = form.sku.trim() || autoSku(form.name);
    const payload = {
      business_id: businessId,
      name: form.name.trim(),
      sku,
      category: form.category.trim(),
      sizes: form.sizes.split(',').map(s => s.trim()).filter(Boolean),
      colors: form.colors.split(',').map(s => s.trim()).filter(Boolean),
      cost_price: Number(form.cost_price) || 0,
      selling_price: Number(form.selling_price) || 0,
      reorder_level: Number(form.reorder_level) || 0,
      quantity: 0,
    };
    const { data, error } = await supabase.from('products').insert(payload).select().single();
    setLoading(false);
    if (error) {
      toast({ title: 'Error adding product', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Product added successfully' });
    onCreated?.(data);
    if (offerRestockNext) {
      setCreatedProduct(data);
    } else {
      onOpenChange(false);
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Category</Label>
                  <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
                </div>
                <div>
                  <Label>SKU <span className="text-muted-foreground text-xs">(auto if empty)</span></Label>
                  <Input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="Auto-generated" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                <Label>Reorder Level</Label>
                <Input type="number" min={0} value={form.reorder_level}
                  onChange={e => setForm({ ...form, reorder_level: Number(e.target.value) })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Sizes <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input value={form.sizes} onChange={e => setForm({ ...form, sizes: e.target.value })} placeholder="S, M, L" />
                </div>
                <div>
                  <Label>Colors <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input value={form.colors} onChange={e => setForm({ ...form, colors: e.target.value })} placeholder="Black, White" />
                </div>
              </div>
              <div>
                <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
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
              <p className="text-sm text-muted-foreground mt-1">{createdProduct.name} is now in your inventory.</p>
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
