import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type DashboardAd = {
  id: string;
  title: string;
  description: string;
  image_url: string;
  cta_text?: string | null;
  cta_url?: string | null;
};

export function DashboardAdsStrip({ ads }: { ads: DashboardAd[] }) {
  if (ads.length === 0) return null;

  const repeated = ads.length > 1 ? [...ads, ...ads] : [...ads, ...ads, ...ads];
  const animationDuration = Math.max(20, ads.length * 9);

  return (
    <section className="rounded-lg border border-border bg-card/70 p-3 sm:p-4">
      <style>{`
        @keyframes dashboard-ads-ltr {
          0% { transform: translateX(calc(-50% - 0.75rem)); }
          100% { transform: translateX(0); }
        }
      `}</style>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">Highlights</p>
          <p className="mt-1 text-sm text-muted-foreground">Platform updates, partner offers, and featured business tools.</p>
        </div>
      </div>

      <div className="overflow-hidden">
        <div
          className="flex w-max items-stretch gap-3 will-change-transform"
          style={{ animation: `dashboard-ads-ltr ${animationDuration}s linear infinite` }}
        >
          {repeated.map((ad, index) => {
            const href = ad.cta_url?.trim() || undefined;
            const external = href ? /^https?:\/\//i.test(href) : false;

            return (
              <article
                key={`${ad.id}-${index}`}
                className={cn(
                  'flex min-h-[108px] w-[292px] shrink-0 items-center gap-3 rounded-lg border border-border bg-background/80 p-3 sm:w-[360px]',
                  'md:w-[400px]',
                )}
              >
                <img
                  src={ad.image_url}
                  alt={ad.title}
                  className="h-20 w-20 shrink-0 rounded-md object-cover sm:h-24 sm:w-24"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{ad.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{ad.description}</p>
                  {href ? (
                    <Button asChild size="sm" variant="outline" className="mt-3 h-8 px-3">
                      <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>
                        {ad.cta_text?.trim() || 'Open'} {external && <ExternalLink className="ml-1.5 h-3.5 w-3.5" />}
                      </a>
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
