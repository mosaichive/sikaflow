import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, BadgeCheck, Check, Loader2, Mail, MapPin, Phone, Rocket, Sparkles, Store, UserRound, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { getOrCreateReferralDeviceId, getPendingReferralToken } from '@/lib/referrals';

type RoleKey = 'owner' | 'manager' | 'admin';
type StepKey = 'business' | 'owner' | 'review';

const STEPS: { key: StepKey; label: string; title: string; subtitle: string }[] = [
  {
    key: 'business',
    label: 'Business',
    title: 'Tell us about the business',
    subtitle: 'These details shape the first dashboard view. You can update them later.',
  },
  {
    key: 'owner',
    label: 'Owner',
    title: 'Who will manage this workspace?',
    subtitle: 'This profile becomes the first admin for the business.',
  },
  {
    key: 'review',
    label: 'Review',
    title: 'Your 30-day trial is ready',
    subtitle: 'No billing step here. The app will remind you when it is time to upgrade.',
  },
];

const ROLES: { key: RoleKey; label: string; description: string }[] = [
  { key: 'owner', label: 'Owner', description: 'I run or own the business' },
  { key: 'manager', label: 'Manager', description: 'I manage daily operations' },
  { key: 'admin', label: 'Administrator', description: 'I handle setup and records' },
];

const TEAM_SIZES = [
  { label: 'Solo', value: 1, detail: 'Just me' },
  { label: '2-5', value: 3, detail: 'Small team' },
  { label: '6-15', value: 10, detail: 'Growing team' },
  { label: '16+', value: 16, detail: 'Larger team' },
];

interface BusinessOnboardingDialogProps {
  open: boolean;
  onCompleted?: () => void;
}

export function BusinessOnboardingDialog({ open, onCompleted }: BusinessOnboardingDialogProps) {
  const { user, displayName, refreshProfile } = useAuth();
  const { refresh: refreshBusiness } = useBusiness();
  const { refresh: refreshSubscription } = useSubscription();
  const { toast } = useToast();
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [companyName, setCompanyName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<RoleKey>('owner');
  const [employees, setEmployees] = useState(1);
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const currentStep = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;
  const email = user?.email ?? '';
  const metadataName = useMemo(
    () => user?.user_metadata?.display_name || user?.user_metadata?.full_name || '',
    [user?.user_metadata],
  );

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setDirection(1);
    setErrors({});
    setOwnerName((current) => current || displayName || metadataName || '');
  }, [displayName, metadataName, open]);

  const clearError = (key: string) => {
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const getErrors = () => {
    const next: Record<string, string> = {};
    if (!companyName.trim()) next.companyName = 'Business name is required';
    if (!location.trim()) next.location = 'Location is required';
    if (Number.isNaN(Number(employees)) || Number(employees) < 1) next.employees = 'Choose a team size';
    if (!ownerName.trim()) next.ownerName = 'Your full name is required';
    if (!email) next.email = 'A signed-in email is required';
    if (!phone.trim()) next.phone = 'Phone is required';
    else if (!/^\+?\d{8,15}$/.test(phone)) next.phone = 'Use international format, for example +233241234567';
    return next;
  };

  const stepFields: Record<StepKey, string[]> = {
    business: ['companyName', 'location', 'employees'],
    owner: ['ownerName', 'phone', 'role', 'email'],
    review: ['companyName', 'location', 'employees', 'ownerName', 'phone', 'email'],
  };

  const validateStep = (key = currentStep.key) => {
    const nextErrors = getErrors();
    setErrors(nextErrors);
    const invalid = stepFields[key].some((field) => !!nextErrors[field]);
    if (invalid) {
      toast({ title: 'Almost there', description: 'Please complete the highlighted fields.', variant: 'destructive' });
    }
    return !invalid;
  };

  const goNext = () => {
    if (!validateStep()) return;
    setDirection(1);
    setStepIndex((value) => Math.min(value + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setDirection(-1);
    setStepIndex((value) => Math.max(value - 1, 0));
  };

  const submitBusinessSetup = async () => {
    if (!user || !validateStep('review')) return;
    setSubmitting(true);
    try {
      const { data: businessId, error: businessError } = await supabase.rpc('create_business_for_owner', {
        _name: companyName.trim(),
        _email: email,
        _phone: phone.trim(),
        _location: location.trim(),
        _employees: employees,
        _logo_light_url: '',
        _logo_dark_url: '',
      });
      if (businessError) throw businessError;
      if (!businessId) throw new Error('Business setup did not return an id');

      await Promise.all([
        supabase.from('businesses').update({
          email_verified: true,
          phone_verified: true,
          status: 'active',
        }).eq('id', businessId),
        supabase.from('profiles').update({
          display_name: ownerName.trim(),
          phone: phone.trim(),
          title: role,
          email_verified: true,
          phone_verified: true,
        }).eq('user_id', user.id),
      ]);

      await supabase.functions.invoke('claim-referral', {
        body: {
          device_id: getOrCreateReferralDeviceId(),
          referral_token: getPendingReferralToken() || undefined,
        },
      });

      await Promise.all([refreshProfile(), refreshBusiness(), refreshSubscription()]);
      toast({ title: 'Workspace created', description: 'Your dashboard is ready and your 30-day trial has started.' });
      onCompleted?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      toast({ title: 'Business setup failed', description: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isLastStep) {
      void submitBusinessSetup();
      return;
    }
    goNext();
  };

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto p-0">
        <DialogHeader className="border-b border-border p-5 pr-12">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">First setup</p>
              <DialogTitle className="mt-1 text-xl">{currentStep.title}</DialogTitle>
              <DialogDescription className="mt-1">{currentStep.subtitle}</DialogDescription>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <BadgeCheck className="h-3.5 w-3.5" /> 30-day trial
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {STEPS.map((step, index) => (
              <button
                key={step.key}
                type="button"
                onClick={() => {
                  if (index <= stepIndex || validateStep()) {
                    setDirection(index > stepIndex ? 1 : -1);
                    setStepIndex(index);
                  }
                }}
                className="group text-left"
                aria-label={`Go to ${step.label}`}
              >
                <span className={cn('block h-1.5 rounded-full transition-colors', index <= stepIndex ? 'bg-primary' : 'bg-muted')} />
                <span className="mt-1 hidden text-[10px] font-medium text-muted-foreground sm:block">{step.label}</span>
              </button>
            ))}
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate>
          <div className="relative min-h-[360px] p-5 sm:p-7">
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={currentStep.key}
                custom={direction}
                initial={{ opacity: 0, x: direction * 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -24 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="space-y-5"
              >
                {currentStep.key === 'business' && (
                  <div className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Business name" icon={Store} error={errors.companyName} required>
                        <Input value={companyName} onChange={(event) => { setCompanyName(event.target.value); clearError('companyName'); }} placeholder="e.g. Mosaic Hive" />
                      </Field>
                      <Field label="Location" icon={MapPin} error={errors.location} required>
                        <Input value={location} onChange={(event) => { setLocation(event.target.value); clearError('location'); }} placeholder="City, country" />
                      </Field>
                    </div>
                    <div>
                      <Label className="mb-2 flex items-center gap-1.5 text-xs">
                        <Users className="h-3.5 w-3.5" /> Team size
                      </Label>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {TEAM_SIZES.map((option) => (
                          <ChoiceCard
                            key={option.label}
                            selected={employees === option.value}
                            title={option.label}
                            description={option.detail}
                            onClick={() => { setEmployees(option.value); clearError('employees'); }}
                          />
                        ))}
                      </div>
                      {errors.employees && <p className="mt-1 text-[10px] text-destructive">{errors.employees}</p>}
                    </div>
                  </div>
                )}

                {currentStep.key === 'owner' && (
                  <div className="space-y-5">
                    <Field label="Full name" icon={UserRound} error={errors.ownerName} required>
                      <Input value={ownerName} onChange={(event) => { setOwnerName(event.target.value); clearError('ownerName'); }} placeholder="Your full name" />
                    </Field>
                    <div>
                      <Label className="mb-2 block text-xs">Your role</Label>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {ROLES.map((item) => (
                          <ChoiceCard
                            key={item.key}
                            selected={role === item.key}
                            title={item.label}
                            description={item.description}
                            onClick={() => setRole(item.key)}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Account email" icon={Mail} error={errors.email} required>
                        <Input value={email} disabled />
                      </Field>
                      <Field label="WhatsApp phone" icon={Phone} error={errors.phone} required>
                        <Input type="tel" value={phone} onChange={(event) => { setPhone(event.target.value); clearError('phone'); }} placeholder="+233241234567" />
                      </Field>
                    </div>
                  </div>
                )}

                {currentStep.key === 'review' && (
                  <div className="space-y-5">
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Sparkles className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="font-semibold">Start with full access for 30 days</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Your dashboard will update instantly after setup. Pricing stays out of onboarding.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ReviewItem label="Business" value={companyName || 'Not set'} />
                      <ReviewItem label="Location" value={location || 'Not set'} />
                      <ReviewItem label="Team size" value={`${employees} ${employees === 1 ? 'person' : 'people'}`} />
                      <ReviewItem label="Role" value={ROLES.find((item) => item.key === role)?.label ?? 'Owner'} />
                      <ReviewItem label="Admin" value={ownerName || 'Not set'} />
                      <ReviewItem label="Email" value={email || 'Not set'} />
                      <ReviewItem label="Phone" value={phone || 'Not set'} />
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Rocket className="h-3.5 w-3.5" /> Finish setup to open your workspace.
            </div>
            <div className="flex gap-2">
              {stepIndex > 0 && (
                <Button type="button" variant="outline" onClick={goBack} disabled={submitting}>
                  Back
                </Button>
              )}
              <Button type="submit" disabled={submitting} className="min-w-36">
                {submitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</>
                ) : isLastStep ? (
                  'Open dashboard'
                ) : (
                  <>Next <ArrowRight className="ml-2 h-4 w-4" /></>
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  icon: Icon,
  error,
  required,
  children,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-1.5 flex items-center gap-1.5 text-xs">
        {Icon && <Icon className="h-3.5 w-3.5" />} {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="mt-1 text-[10px] text-destructive">{error}</p>}
    </div>
  );
}

function ChoiceCard({
  selected,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-24 rounded-lg border p-3 text-left transition-colors',
        selected ? 'border-primary bg-primary/5 text-foreground' : 'border-border bg-background hover:border-primary/50',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <Check className={cn('h-4 w-4 text-primary transition-opacity', selected ? 'opacity-100' : 'opacity-0')} />
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
    </button>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  );
}
