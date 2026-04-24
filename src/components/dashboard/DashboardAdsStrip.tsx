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
    <section className="rounded-lg border border-border/50 bg-muted/5 px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <div className="shrink-0">
          <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-primary/70">Highlights</p>
        </div>

        <div
          className="min-w-0 flex-1 overflow-hidden"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div
            ref={viewportRef}
            className="flex gap-1.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {duplicated.map((ad, index) => {
              const href = ad.cta_url?.trim();
              const isExternal = href ? /^https?:\/\//i.test(href) : false;

              return (
                <article
                  key={`${ad.id}-${index}`}
                  className={cn(
                    'flex h-[56px] w-[190px] shrink-0 items-center gap-2 rounded-md border border-border/45 bg-background/55 px-2 py-1.5 shadow-none',
                    'sm:w-[220px] md:w-[238px]',
                  )}
                >
                  <img
                    src={ad.image_url}
                    alt={ad.title}
                    loading="lazy"
                    className="h-7 w-7 shrink-0 rounded object-cover opacity-90"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-foreground/90">{ad.title}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{ad.description}</p>
                  </div>
                  {href ? (
                    <Button asChild variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground/80 hover:text-foreground">
                      <a href={href} target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noreferrer' : undefined} aria-label={ad.cta_text?.trim() || ad.title}>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>

        {ads.length > 1 ? (
          <div className="hidden items-center gap-0.5 md:flex">
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground/80" onClick={() => scrollByAmount(-1)}>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground/80" onClick={() => scrollByAmount(1)}>
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
