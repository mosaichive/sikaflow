import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ImagePlus, Loader2, Package, Store, Warehouse } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { BUSINESS_TYPES, SIKAFLOW_TOOLTIPS } from '@/lib/constants';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  createProductRecord,
  ensureUserBusinessWorkspace,
  getErrorMessage,
  insertStockMovementCompat,
  logSupabaseError,
  rememberCachedProduct,
  updateBusinessWorkspaceRecord,
  updateProfileRecord,
} from '@/lib/workspace';

type SetupStep = 'business' | 'opening_stock' | 'confirm';

type OpeningStockProduct = {
  id: string;
  name: string;
  category: string;
  quantity: string;
  costPrice: string;
  sellingPrice: string;
  lowStockThreshold: string;
  imageFile: File | null;
};

interface FirstTimeSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
}

function getOnboardingCompletionKey(userId: string) {
  return `sikaflow_onboarding_complete_${userId}`;
}

function makeProductRow(): OpeningStockProduct {
  return {
    id: crypto.randomUUID(),
    name: '',
    category: '',
    quantity: '1',
    costPrice: '0',
    sellingPrice: '0',
    lowStockThreshold: '3',
    imageFile: null,
  };
}

function generateSetupSku(name: string) {
  const base = name.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || 'ITEM';
  return `${base}-${Date.now().toString().slice(-6)}`;
}

async function uploadBusinessLogo(businessId: string, file: File) {
  const ext = file.name.split('.').pop() || 'png';
  const path = `${businessId}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('business-logos').upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('business-logos').getPublicUrl(path);
  return data.publicUrl;
}

async function uploadProductImage(businessId: string, productId: string, file: File) {
  const ext = file.name.split('.').pop() || 'png';
  const path = `${businessId}/${productId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}

export function FirstTimeSetupDialog({ open, onOpenChange, onCompleted }: FirstTimeSetupDialogProps) {
  const { user, displayName, refreshProfile } = useAuth();
  const { business, refresh: refreshBusiness } = useBusiness();
  const { refresh: refreshSubscription } = useSubscription();
  const { toast } = useToast();
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState(BUSINESS_TYPES[0]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [location, setLocation] = useState('');
  const [businessLogoFile, setBusinessLogoFile] = useState<File | null>(null);
  const [hasOpeningStock, setHasOpeningStock] = useState<'yes' | 'no'>('yes');
  const [openingStockProducts, setOpeningStockProducts] = useState<OpeningStockProduct[]>([makeProductRow()]);

  const steps: SetupStep[] = ['business', 'opening_stock', 'confirm'];
  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setBusinessName(business?.name || '');
    setBusinessType(BUSINESS_TYPES[0]);
    setPhoneNumber(business?.phone || '');
    setLocation(business?.location || '');
    setBusinessLogoFile(null);
    setHasOpeningStock('yes');
    setOpeningStockProducts([makeProductRow()]);
  }, [business?.location, business?.name, business?.phone, open]);

  const activeProducts = useMemo(
    () => openingStockProducts.filter((product) => product.name.trim()),
    [openingStockProducts],
  );

  const validateCurrentStep = () => {
    if (currentStep === 'business') {
      if (!businessName.trim()) {
        toast({ title: 'Business name required', description: 'Enter the business name to continue.', variant: 'destructive' });
        return false;
      }
      if (!phoneNumber.trim()) {
        toast({ title: 'Phone number required', description: 'Enter the business phone number to continue.', variant: 'destructive' });
        return false;
      }
      if (!location.trim()) {
        toast({ title: 'Location required', description: 'Enter the business location to continue.', variant: 'destructive' });
        return false;
      }
    }

    if (currentStep === 'opening_stock' && hasOpeningStock === 'yes') {
      if (activeProducts.length === 0) {
        toast({ title: 'Add at least one product', description: 'Include your first opening stock item or choose No to skip.', variant: 'destructive' });
        return false;
      }

      for (const product of activeProducts) {
        if (!product.category.trim()) {
          toast({ title: 'Product category required', description: `Add a category for ${product.name || 'your product'}.`, variant: 'destructive' });
          return false;
        }
        if (Number(product.quantity) <= 0) {
          toast({ title: 'Invalid stock quantity', description: 'Opening stock quantity must be at least 1.', variant: 'destructive' });
          return false;
        }
        if (Number(product.sellingPrice) <= 0) {
          toast({ title: 'Invalid selling price', description: 'Selling price must be greater than zero.', variant: 'destructive' });
          return false;
        }
        if (Number(product.costPrice) < 0) {
          toast({ title: 'Invalid cost price', description: 'Cost price cannot be negative.', variant: 'destructive' });
          return false;
        }
      }
    }

    return true;
  };

  const setProductField = (id: string, field: keyof OpeningStockProduct, value: string | File | null) => {
    setOpeningStockProducts((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  };

  const addOpeningStockRow = () => {
    setOpeningStockProducts((rows) => [...rows, makeProductRow()]);
  };

  const removeOpeningStockRow = (id: string) => {
    setOpeningStockProducts((rows) => (rows.length === 1 ? rows : rows.filter((row) => row.id !== id)));
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
      const trimmedBusinessName = businessName.trim();
      const trimmedPhone = phoneNumber.trim();
      const trimmedLocation = location.trim();
      const businessId = await ensureUserBusinessWorkspace({
        existingBusinessId: business?.id ?? null,
        user,
        displayName: displayName || user.email || trimmedBusinessName,
        businessName: trimmedBusinessName,
        phone: trimmedPhone,
        location: trimmedLocation,
      });

      let logoUrl: string | null = business?.logo_light_url || null;
      if (businessLogoFile && businessId) {
        try {
          logoUrl = await uploadBusinessLogo(businessId, businessLogoFile);
        } catch (logoError) {
          logSupabaseError('onboarding.businessLogoUpload', logoError, {
            businessId,
            fileName: businessLogoFile.name,
          });
        }
      }

      await updateBusinessWorkspaceRecord(businessId, {
          name: trimmedBusinessName,
          business_type: businessType,
          phone: trimmedPhone,
          location: trimmedLocation,
          logo_light_url: logoUrl,
          logo_dark_url: logoUrl,
          status: 'active',
          email_verified: true,
        });

      await updateProfileRecord(user.id, {
          business_id: businessId,
          display_name: displayName || user.email || trimmedBusinessName,
          phone: trimmedPhone,
          email_verified: true,
          onboarding_completed: false,
        });

      if (hasOpeningStock === 'yes' && activeProducts.length > 0) {
        for (const row of activeProducts) {
          const quantity = Number(row.quantity);
          const costPrice = Number(row.costPrice);
          const sellingPrice = Number(row.sellingPrice);
          const lowStockThreshold = Number(row.lowStockThreshold || 0);
          const sku = generateSetupSku(row.name);

          const createdProduct = await createProductRecord({
              business_id: businessId,
              user_id: user.id,
              name: row.name.trim(),
              sku,
              category: row.category.trim(),
              cost_price: costPrice,
              selling_price: sellingPrice,
              quantity,
              reorder_level: lowStockThreshold,
              low_stock_threshold: lowStockThreshold,
              is_archived: false,
            });

          rememberCachedProduct(businessId, {
            id: createdProduct.id,
            name: row.name.trim(),
            category: row.category.trim(),
            sku,
            cost_price: costPrice,
            selling_price: sellingPrice,
            quantity,
            reorder_level: lowStockThreshold,
            low_stock_threshold: lowStockThreshold,
            is_archived: false,
          });

          if (row.imageFile) {
            try {
              const imageUrl = await uploadProductImage(businessId, createdProduct.id, row.imageFile);
              const { error: imageUpdateError } = await supabase
                .from('products')
                .update({ image_url: imageUrl } as never)
                .eq('id', createdProduct.id);
              if (imageUpdateError) throw imageUpdateError;
            } catch (imageError) {
              logSupabaseError('onboarding.productImageUpload', imageError, {
                businessId,
                productId: createdProduct.id,
                productName: row.name.trim(),
              });
            }
          }

          try {
            const movementResult = await insertStockMovementCompat({
              business_id: businessId,
              product_id: createdProduct.id,
              movement_type: 'opening_stock',
              quantity_change: quantity,
              quantity_after: quantity,
              unit_cost: costPrice,
              unit_price: sellingPrice,
              note: 'Opening Stock',
              created_by: user.id,
              created_by_name: displayName || user.email || trimmedBusinessName,
              movement_date: new Date().toISOString(),
            });
            if (movementResult.skipped) {
              toast({
                title: 'Opening stock saved',
                description: 'Product setup completed. Inventory history will sync after database updates finish propagating.',
              });
            }
          } catch (movementError) {
            logSupabaseError('onboarding.openingStockMovement', movementError, {
              businessId,
              productId: createdProduct.id,
              productName: row.name.trim(),
            });
            toast({
              title: 'Product saved',
              description: 'Opening stock history could not be recorded yet, but your product was created successfully.',
            });
          }
        }
      }

      await updateProfileRecord(user.id, { onboarding_completed: true });

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(getOnboardingCompletionKey(user.id), 'true');
      }

      await Promise.all([refreshProfile(), refreshBusiness(), refreshSubscription()]);
      toast({
        title: 'Setup complete',
        description: hasOpeningStock === 'yes'
          ? 'Opening stock has been added. Your dashboard is ready for selling.'
          : 'Your business is ready. Add products anytime from Products or Inventory.',
      });
      onCompleted?.();
      onOpenChange(false);
    } catch (error: unknown) {
      logSupabaseError('onboarding.finishSetup', error, {
        userId: user.id,
        hasOpeningStock,
        openingStockCount: activeProducts.length,
      });
      toast({
        title: 'Could not finish setup',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-none border-b border-border px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Fresh setup</p>
              <DialogTitle className="mt-2 text-2xl">Build your store in a few quick steps</DialogTitle>
              <DialogDescription className="mt-1">
                We&apos;ll capture your business details, add opening stock if you already have products, and drop you into a ready-to-sell dashboard.
              </DialogDescription>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Store className="h-3.5 w-3.5" />
              First-time onboarding
            </span>
          </div>

          <div className="mt-4 flex gap-2">
            {steps.map((step, index) => (
              <div key={step} className="min-w-0 flex-1">
                <div className={`h-1.5 rounded-full ${index <= stepIndex ? 'bg-primary' : 'bg-muted'}`} />
                <p className="mt-2 text-[11px] font-medium capitalize text-muted-foreground">
                  {step === 'opening_stock' ? 'Opening Stock' : step}
                </p>
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5 pb-28">
          {currentStep === 'business' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <Store className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Step 1: Business setup</h3>
                  <p className="text-sm text-muted-foreground">These details show on receipts, reports, and the workspace header.</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="setup-business-name">Business Name</Label>
                  <Input id="setup-business-name" value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="e.g. Maggs Trove" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup-business-type">Business Type</Label>
                  <Select value={businessType} onValueChange={setBusinessType}>
                    <SelectTrigger id="setup-business-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BUSINESS_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup-business-phone">Phone Number</Label>
                  <Input id="setup-business-phone" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="+233 24 000 0000" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup-business-location">Location</Label>
                  <Input id="setup-business-location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Accra, Ghana" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="setup-business-logo">Business Logo (optional)</Label>
                  <Input
                    id="setup-business-logo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => setBusinessLogoFile(event.target.files?.[0] || null)}
                  />
                </div>
              </div>
            </div>
          )}

          {currentStep === 'opening_stock' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <Warehouse className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Step 2: Opening Stock setup</h3>
                  <p className="text-sm text-muted-foreground">Opening Stock increases inventory only. It does not count as income, expense, or available money.</p>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">Do you already have products in stock?</p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="rounded-full text-muted-foreground underline decoration-dotted underline-offset-4">
                        why?
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-sm">
                      {SIKAFLOW_TOOLTIPS.openingStock}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant={hasOpeningStock === 'yes' ? 'default' : 'outline'} onClick={() => setHasOpeningStock('yes')}>
                    Yes, add opening stock
                  </Button>
                  <Button type="button" variant={hasOpeningStock === 'no' ? 'default' : 'outline'} onClick={() => setHasOpeningStock('no')}>
                    No, skip for now
                  </Button>
                </div>
              </div>

              {hasOpeningStock === 'yes' ? (
                <div className="space-y-3">
                  {openingStockProducts.map((product, index) => (
                    <Card key={product.id} className="border-border/70">
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold">Opening Stock Item {index + 1}</p>
                            <p className="text-xs text-muted-foreground">This product will be added to inventory immediately after setup.</p>
                          </div>
                          {openingStockProducts.length > 1 ? (
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeOpeningStockRow(product.id)}>
                              Remove
                            </Button>
                          ) : null}
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2 md:col-span-2">
                            <Label>Product Name</Label>
                            <Input value={product.name} onChange={(event) => setProductField(product.id, 'name', event.target.value)} placeholder="e.g. Plain T-Shirt" />
                          </div>
                          <div className="space-y-2">
                            <Label>Category</Label>
                            <Input value={product.category} onChange={(event) => setProductField(product.id, 'category', event.target.value)} placeholder="e.g. Clothing" />
                          </div>
                          <div className="space-y-2">
                            <Label>Quantity</Label>
                            <Input type="number" min="1" step="1" value={product.quantity} onChange={(event) => setProductField(product.id, 'quantity', event.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>Cost Price</Label>
                            <Input type="number" min="0" step="0.01" value={product.costPrice} onChange={(event) => setProductField(product.id, 'costPrice', event.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>Selling Price</Label>
                            <Input type="number" min="0" step="0.01" value={product.sellingPrice} onChange={(event) => setProductField(product.id, 'sellingPrice', event.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>Low Stock Alert Quantity</Label>
                            <Input type="number" min="0" step="1" value={product.lowStockThreshold} onChange={(event) => setProductField(product.id, 'lowStockThreshold', event.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>Product Image (optional)</Label>
                            <Input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              onChange={(event) => setProductField(product.id, 'imageFile', event.target.files?.[0] || null)}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  <Button type="button" variant="outline" onClick={addOpeningStockRow}>
                    <ImagePlus className="mr-2 h-4 w-4" />
                    Add another opening stock item
                  </Button>
                </div>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="p-5 text-sm text-muted-foreground">
                    No problem. We&apos;ll take you straight to the dashboard, and you can add products later from Products or Inventory.
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {currentStep === 'confirm' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Step 3: Confirm setup</h3>
                  <p className="text-sm text-muted-foreground">We&apos;ll save the business profile, create opening stock if needed, and then load the dashboard with real data.</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Card>
                  <CardContent className="space-y-2 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Business</p>
                    <p className="text-base font-semibold text-foreground">{businessName}</p>
                    <p className="text-sm text-muted-foreground">{businessType} • {location}</p>
                    <p className="text-sm text-muted-foreground">{phoneNumber}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="space-y-2 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Opening Stock</p>
                    {hasOpeningStock === 'yes' ? (
                      <>
                        <p className="text-base font-semibold text-foreground">{activeProducts.length} product(s) will be added</p>
                        <p className="text-sm text-muted-foreground">Each item appears in inventory history as Opening Stock only.</p>
                      </>
                    ) : (
                      <>
                        <p className="text-base font-semibold text-foreground">No opening stock</p>
                        <p className="text-sm text-muted-foreground">You can start by adding products later from the workspace.</p>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 z-10 flex items-center justify-between border-t border-border bg-background/95 px-6 py-4 backdrop-blur-sm">
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
