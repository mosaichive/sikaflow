import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Package, Sparkles, Store } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getOrCreateReferralDeviceId, getPendingReferralToken } from '@/lib/referrals';
import { formatCurrency } from '@/lib/constants';

type SetupStep = 'business' | 'product' | 'confirm';

function generateSetupSku(name: string) {
  const base = name.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || 'ITEM';
  return `${base}-${Date.now().toString().slice(-6)}`;
}

interface FirstTimeSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
}

export function FirstTimeSetupDialog({
  open,
  onOpenChange,
  onCompleted,
}: FirstTimeSetupDialogProps) {
  const { user, displayName, refreshProfile } = useAuth();
  const { business, refresh: refreshBusiness } = useBusiness();
  const { refresh: refreshSubscription } = useSubscription();
  const { toast } = useToast();
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [productName, setProductName] = useState('');
  const [costPrice, setCostPrice] = useState('0');
  const [sellingPrice, setSellingPrice] = useState('0');
  const [stockQuantity, setStockQuantity] = useState('1');

  const needsBusinessName = !business?.name?.trim();
  const steps = useMemo<SetupStep[]>(
    () => (needsBusinessName ? ['business', 'product', 'confirm'] : ['product', 'confirm']),
    [needsBusinessName],
  );
  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setBusinessName((current) => current || business?.name || '');
  }, [business?.name, open]);

  const parsedCostPrice = Number(costPrice || 0);
  const parsedSellingPrice = Number(sellingPrice || 0);
  const parsedStockQuantity = Math.max(0, Number(stockQuantity || 0));

  const validateCurrentStep = () => {
    if (currentStep === 'business' && !businessName.trim()) {
      toast({
        title: 'Business name required',
        description: 'Enter the business name before continuing.',
        variant: 'destructive',
      });
      return false;
    }

    if (currentStep === 'product') {
      if (!productName.trim()) {
        toast({
          title: 'Product name required',
          description: 'Add the name of the first product you want to sell.',
          variant: 'destructive',
        });
        return false;
      }
      if (!Number.isFinite(parsedCostPrice) || parsedCostPrice < 0) {
        toast({
          title: 'Invalid cost price',
          description: 'Cost price must be zero or higher.',
          variant: 'destructive',
        });
        return false;
      }
      if (!Number.isFinite(parsedSellingPrice) || parsedSellingPrice <= 0) {
        toast({
          title: 'Invalid selling price',
          description: 'Selling price must be greater than zero.',
          variant: 'destructive',
        });
        return false;
      }
      if (!Number.isFinite(parsedStockQuantity) || parsedStockQuantity < 0) {
        toast({
          title: 'Invalid stock quantity',
          description: 'Stock quantity cannot be negative.',
          variant: 'destructive',
        });
        return false;
      }
    }

    return true;
  };

  const goNext = () => {
    if (!validateCurrentStep()) return;
    setStepIndex((value) => Math.min(value + 1, steps.length - 1));
  };

  const goBack = () => {
    setStepIndex((value) => Math.max(value - 1, 0));
  };

  const handleComplete = async () => {
    if (!user || !validateCurrentStep()) return;
    setSubmitting(true);

    try {
      let businessId = business?.id ?? null;
      const trimmedBusinessName = businessName.trim() || business?.name || displayName || 'My Business';

      if (!businessId) {
        const { data, error } = await supabase.rpc('create_business_for_owner', {
          _name: trimmedBusinessName,
          _email: user.email ?? '',
          _phone: '',
          _location: '',
          _employees: 1,
          _logo_light_url: '',
          _logo_dark_url: '',
        });
        if (error) throw error;
        if (!data) throw new Error('Business setup did not return an id.');
        businessId = data;

        await Promise.all([
          supabase
            .from('businesses')
            .update({
              status: 'active',
              email_verified: true,
            })
            .eq('id', businessId),
          supabase
            .from('profiles')
            .update({
              display_name: displayName || user.email || trimmedBusinessName,
              email_verified: true,
            } as never)
            .eq('user_id', user.id),
        ]);

        await supabase.functions.invoke('claim-referral', {
          body: {
            device_id: getOrCreateReferralDeviceId(),
            referral_token: getPendingReferralToken() || undefined,
          },
        });
      } else if (needsBusinessName) {
        const { error } = await supabase
          .from('businesses')
          .update({ name: trimmedBusinessName })
          .eq('id', businessId);
        if (error) throw error;
      }

      const { error: productError } = await supabase.from('products').insert({
        business_id: businessId,
        name: productName.trim(),
        sku: generateSetupSku(productName),
        category: '',
        brand: '',
        sizes: [],
        colors: [],
        cost_price: parsedCostPrice,
        selling_price: parsedSellingPrice,
        quantity: parsedStockQuantity,
        reorder_level: Math.max(1, Math.min(parsedStockQuantity || 1, 5)),
        supplier: '',
        barcode: '',
      } as never);
      if (productError) throw productError;

      await Promise.all([refreshProfile(), refreshBusiness(), refreshSubscription()]);
      toast({
        title: 'Setup complete',
        description: 'Your first product is ready in inventory. You can start selling now.',
      });
      onCompleted?.();
      onOpenChange(false);
    } catch (error: unknown) {
      toast({
        title: 'Could not finish setup',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Quick setup</p>
              <DialogTitle className="mt-2 text-2xl">Let&apos;s get your business ready</DialogTitle>
              <DialogDescription className="mt-1">
                Add the basics once, then jump straight into selling with real inventory on the dashboard.
              </DialogDescription>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              First-time setup
            </span>
          </div>

          <div className="mt-4 flex gap-2">
            {steps.map((step, index) => (
              <div key={step} className="min-w-0 flex-1">
                <div className={`h-1.5 rounded-full ${index <= stepIndex ? 'bg-primary' : 'bg-muted'}`} />
                <p className="mt-2 text-[11px] font-medium capitalize text-muted-foreground">{step === 'confirm' ? 'Confirm' : step}</p>
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="space-y-6 px-6 py-6">
          {currentStep === 'business' ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <Store className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Step 1: Business name</h3>
                  <p className="text-sm text-muted-foreground">This name shows on the dashboard, receipts, and reports.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="setup-business-name">Business Name</Label>
                <Input
                  id="setup-business-name"
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                  placeholder="e.g. Maggs Trove"
                />
              </div>
            </div>
          ) : null}

          {currentStep === 'product' ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Step {needsBusinessName ? '2' : '1'}: Add your first product</h3>
                  <p className="text-sm text-muted-foreground">Once this product is in stock, you can start recording sales immediately.</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2 space-y-2">
                  <Label htmlFor="setup-product-name">Product Name</Label>
                  <Input
                    id="setup-product-name"
                    value={productName}
                    onChange={(event) => setProductName(event.target.value)}
                    placeholder="e.g. Plain T-Shirt"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup-cost-price">Cost Price</Label>
                  <Input
                    id="setup-cost-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={costPrice}
                    onChange={(event) => setCostPrice(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup-selling-price">Selling Price</Label>
                  <Input
                    id="setup-selling-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={sellingPrice}
                    onChange={(event) => setSellingPrice(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup-stock-quantity">Stock Quantity</Label>
                  <Input
                    id="setup-stock-quantity"
                    type="number"
                    min="0"
                    step="1"
                    value={stockQuantity}
                    onChange={(event) => setStockQuantity(event.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {currentStep === 'confirm' ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Step {steps.length}: Confirm setup</h3>
                  <p className="text-sm text-muted-foreground">We&apos;ll save this product, refresh the dashboard, and leave you ready to sell.</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardContent className="space-y-2 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Business</p>
                    <p className="text-base font-semibold text-foreground">{businessName.trim() || business?.name || 'Business name will be saved'}</p>
                    <p className="text-sm text-muted-foreground">Dashboard and inventory will use this business profile.</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="space-y-2 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">First Product</p>
                    <p className="text-base font-semibold text-foreground">{productName || 'Your first product'}</p>
                    <p className="text-sm text-muted-foreground">
                      {parsedStockQuantity.toLocaleString('en-GH')} in stock at {formatCurrency(parsedSellingPrice)} each
                    </p>
                    <p className="text-sm text-muted-foreground">Cost price: {formatCurrency(parsedCostPrice)}</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <Button type="button" variant="ghost" onClick={stepIndex === 0 ? () => onOpenChange(false) : goBack} disabled={submitting}>
            {stepIndex === 0 ? 'Later' : 'Back'}
          </Button>

          {isLastStep ? (
            <Button type="button" onClick={() => void handleComplete()} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Finish setup
            </Button>
          ) : (
            <Button type="button" onClick={goNext}>
              Continue
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
