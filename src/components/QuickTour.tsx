import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Receipt,
  BarChart3,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
} from 'lucide-react';

interface QuickTourProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessName?: string;
}

interface Step {
  icon: typeof LayoutDashboard;
  title: string;
  description: string;
  bullets: string[];
  cta?: { label: string; route: string };
  accent: string;
}

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: 'Welcome aboard',
    description:
      'SikaFlow helps you run the day-to-day of your business — from selling and stocking, to tracking spending and profit. Here is a 60-second tour.',
    bullets: [
      'Built for Ghanaian SMEs',
      'Realtime numbers across every page',
      'Works on phone, tablet and laptop',
    ],
    accent: 'from-primary/20 to-primary/5',
  },
  {
    icon: ShoppingCart,
    title: 'Record sales in seconds',
    description:
      'Add a sale, pick the customer (or walk-in), choose products, and capture the payment. Cash, momo, bank — and partial payments are supported.',
    bullets: [
      'Auto-deducts from inventory',
      'Tracks outstanding balances',
      'Generates a receipt instantly',
    ],
    cta: { label: 'Open Sales Entry', route: '/sales' },
    accent: 'from-emerald-500/20 to-emerald-500/5',
  },
  {
    icon: Boxes,
    title: 'Manage your inventory',
    description:
      'Add products with cost & selling prices. Restock anytime, and get low-stock alerts before you run out.',
    bullets: [
      'Cost vs selling price tracking',
      'Restock history with supplier notes',
      'Reorder level warnings',
    ],
    cta: { label: 'Go to Inventory', route: '/inventory' },
    accent: 'from-blue-500/20 to-blue-500/5',
  },
  {
    icon: Receipt,
    title: 'Track every expense',
    description:
      'Log rent, utilities, transport and more. Categorised expenses give you a true net-profit picture, not just revenue.',
    bullets: [
      'Categorise spending',
      'See expense impact on profit',
      'Filter by month or year',
    ],
    cta: { label: 'Add Expenses', route: '/expenses' },
    accent: 'from-amber-500/20 to-amber-500/5',
  },
  {
    icon: BarChart3,
    title: 'See the full picture',
    description:
      'Reports give you sales trends, top products, profit margins and cash flow — exportable for your records or your accountant.',
    bullets: [
      'Daily, monthly and yearly views',
      'Profit & loss at a glance',
      'Export to PDF or share',
    ],
    cta: { label: 'View Reports', route: '/reports' },
    accent: 'from-violet-500/20 to-violet-500/5',
  },
];

export function QuickTour({ open, onOpenChange, businessName }: QuickTourProps) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const total = STEPS.length;
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === total - 1;
  const isFirst = step === 0;

  const close = () => {
    onOpenChange(false);
    setTimeout(() => setStep(0), 300);
  };

  const goTo = (route: string) => {
    close();
    navigate(route);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-lg p-0 overflow-hidden gap-0">
        {/* Hero */}
        <div className={`bg-gradient-to-br ${current.accent} px-6 pt-8 pb-6`}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-background/80 backdrop-blur flex items-center justify-center shadow-sm">
              <Icon className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                Step {step + 1} of {total}
                {isFirst && businessName ? ` · ${businessName}` : ''}
              </p>
              <h2 className="text-xl font-bold leading-tight mt-0.5">{current.title}</h2>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex gap-1.5 mt-5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={`Go to step ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === step
                    ? 'w-8 bg-primary'
                    : i < step
                    ? 'w-4 bg-primary/60'
                    : 'w-4 bg-foreground/15 hover:bg-foreground/30'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{current.description}</p>

          <ul className="space-y-2">
            {current.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 w-4 h-4 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <Check className="h-3 w-3" />
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>

          {current.cta && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => goTo(current.cta!.route)}
            >
              {current.cta.label}
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-muted/30">
          <Button variant="ghost" size="sm" onClick={close}>
            Skip tour
          </Button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                Back
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={close}>
                Get started
                <Sparkles className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep(step + 1)}>
                Next
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
