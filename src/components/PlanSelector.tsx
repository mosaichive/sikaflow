import { Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PlanKey = 'free_trial' | 'monthly' | 'annual';

interface Props {
  value: PlanKey;
  onChange: (p: PlanKey) => void;
}

const PLANS: { key: PlanKey; name: string; price: string; sub: string; perks: string[]; badge?: string }[] = [
  {
    key: 'free_trial',
    name: '30-Day Free Trial',
    price: 'GH₵0',
    sub: 'Full access · 30 days',
    perks: ['All features unlocked', 'No payment required', 'Pick a plan after trial'],
  },
  {
    key: 'monthly',
    name: 'Monthly',
    price: 'GH₵50',
    sub: 'per month',
    perks: ['All features unlocked', 'Cancel anytime', 'Renews every 30 days'],
  },
  {
    key: 'annual',
    name: 'Annual',
    price: 'GH₵500',
    sub: 'per year',
    perks: ['Full access', '1 month free', 'Additional free month on referrals', 'Best value'],
    badge: 'Best value',
  },
];

export function PlanSelector({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {PLANS.map((p) => {
        const selected = value === p.key;
        return (
          <button
            type="button"
            key={p.key}
            onClick={() => onChange(p.key)}
            className={cn(
              'relative text-left rounded-xl border-2 p-4 transition-all',
              selected
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border hover:border-primary/40 bg-card',
            )}
          >
            {p.badge && (
              <div className="absolute -top-2 right-3 bg-primary text-primary-foreground text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5" /> {p.badge}
              </div>
            )}
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-foreground">{p.name}</h3>
              {selected && <Check className="h-4 w-4 text-primary" />}
            </div>
            <div className="text-xl font-bold text-foreground">{p.price}</div>
            <p className="text-[11px] text-muted-foreground mb-3">{p.sub}</p>
            <ul className="space-y-1">
              {p.perks.map((perk) => (
                <li key={perk} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                  <Check className="h-3 w-3 text-primary mt-0.5 shrink-0" /> {perk}
                </li>
              ))}
            </ul>
          </button>
        );
      })}
    </div>
  );
}
