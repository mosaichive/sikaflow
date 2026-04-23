import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
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
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(false);
  const duplicated = useMemo(() => (ads.length > 1 ? [...ads, ...ads] : ads), [ads]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || ads.length <= 1) return;

    let frame = 0;
    const step = () => {
      if (!paused) {
        viewport.scrollLeft += 0.35;
        const resetPoint = viewport.scrollWidth / 2;
        if (viewport.scrollLeft >= resetPoint) viewport.scrollLeft -= resetPoint;
      }
      frame = window.requestAnimationFrame(step);
    };

    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [ads.length, paused]);

  if (ads.length === 0) return null;

  const scrollByAmount = (direction: -1 | 1) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollBy({ left: direction * 240, behavior: 'smooth' });
  };

  return (
    <section className="rounded-xl border border-border/60 bg-muted/10 px-3 py-2">
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/80">Highlights</p>
        </div>

        <div
          className="min-w-0 flex-1 overflow-hidden"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div
            ref={viewportRef}
            className="flex gap-2 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {duplicated.map((ad, index) => {
              const href = ad.cta_url?.trim();
              const isExternal = href ? /^https?:\/\//i.test(href) : false;

              return (
                <article
                  key={`${ad.id}-${index}`}
                  className={cn(
                    'flex h-[72px] w-[220px] shrink-0 items-center gap-2 rounded-lg border border-border/60 bg-background/70 px-2.5 py-2 shadow-none',
                    'sm:w-[250px] md:w-[270px]',
                  )}
                >
                  <img
                    src={ad.image_url}
                    alt={ad.title}
                    loading="lazy"
                    className="h-9 w-9 shrink-0 rounded-md object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{ad.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{ad.description}</p>
                  </div>
                  {href ? (
                    <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground">
                      <a href={href} target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noreferrer' : undefined} aria-label={ad.cta_text?.trim() || ad.title}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>

        {ads.length > 1 ? (
          <div className="hidden items-center gap-1 sm:flex">
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => scrollByAmount(-1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => scrollByAmount(1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
