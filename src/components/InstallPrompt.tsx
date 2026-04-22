import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Download, Share, Plus, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

const DISMISS_KEY = 'pwa_install_dismissed_at';
const DISMISS_HOURS = 72; // re-prompt after 3 days

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type IOSNavigator = Navigator & { standalone?: boolean };

function isStandalone() {
  if (typeof window === 'undefined') return false;
  if ((window.navigator as IOSNavigator).standalone) return true;
  return window.matchMedia('(display-mode: standalone)').matches;
}

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)
    ? true
    : /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function recentlyDismissed() {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (!ts) return false;
    return Date.now() - ts < DISMISS_HOURS * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function inEmbeddedPreview() {
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  return false;
}

function setDismissedUntil(value: number) {
  try {
    localStorage.setItem(DISMISS_KEY, String(value));
  } catch {
    return;
  }
}

export function InstallPrompt() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (!isMobile) return;
    if (isStandalone()) return;
    if (inEmbeddedPreview()) return;
    if (recentlyDismissed()) return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setOpen(true);
    };
    window.addEventListener('beforeinstallprompt', onBIP);

    // iOS Safari has no beforeinstallprompt — show manual hint after a delay
    const t = setTimeout(() => {
      if (!isStandalone() && isIOS() && !recentlyDismissed()) {
        setIosHint(true);
        setOpen(true);
      }
    }, 1200);

    const onInstalled = () => {
      setOpen(false);
      setDismissedUntil(Date.now() + 365 * 24 * 60 * 60 * 1000);
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
      clearTimeout(t);
    };
  }, [isMobile]);

  const dismiss = () => {
    setDismissedUntil(Date.now());
    setOpen(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted') {
      setDismissedUntil(Date.now() + 365 * 24 * 60 * 60 * 1000);
    } else {
      dismiss();
    }
    setDeferred(null);
    setOpen(false);
  };

  if (!isMobile) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl border-t border-border pb-8">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-3 mb-1">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <img src="/icon-192.png" alt="SikaFlow" className="h-9 w-9 object-contain" />
            </div>
            <div className="flex-1">
              <SheetTitle className="text-base font-bold">Install SikaFlow</SheetTitle>
              <SheetDescription className="text-xs">Add to your home screen for an app-like experience.</SheetDescription>
            </div>
            <button onClick={dismiss} className="p-2 rounded-lg text-muted-foreground hover:bg-secondary" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </SheetHeader>

        {iosHint ? (
          <div className="mt-3 space-y-3">
            <div className="rounded-xl border border-border bg-secondary/40 p-3 text-sm space-y-2">
              <p className="flex items-center gap-2"><Share className="h-4 w-4" /> Tap the <strong>Share</strong> button in Safari</p>
              <p className="flex items-center gap-2"><Plus className="h-4 w-4" /> Choose <strong>Add to Home Screen</strong></p>
            </div>
            <Button variant="outline" className="w-full" onClick={dismiss}>Not now</Button>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={dismiss}>Not now</Button>
            <Button onClick={install} className="gap-2">
              <Download className="h-4 w-4" /> Add to Home Screen
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
