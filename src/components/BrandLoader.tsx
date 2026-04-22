import { Logo } from '@/components/Logo';
import { useBusiness } from '@/context/BusinessContext';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

interface BrandLoaderProps {
  text?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  /** When true, renders as a fullscreen overlay */
  overlay?: boolean;
  /**
   * When true, prefer the current tenant business's uploaded logo (theme-aware).
   * Falls back to the platform Logo if no tenant logo is available.
   */
  useTenantLogo?: boolean;
}

const sizeMap = {
  sm: 'h-8 w-8',
  md: 'h-14 w-14',
  lg: 'h-20 w-20',
};

/**
 * Branded loading indicator. By default uses the platform logo (safe for boot/auth screens).
 * Pass `useTenantLogo` inside an authenticated workspace to render the tenant's own logo.
 */
export function BrandLoader({ text, className, size = 'md', overlay = false, useTenantLogo = false }: BrandLoaderProps) {
  const { business } = useBusiness();
  const { isDark } = useTheme();
  const tenantSrc = useTenantLogo
    ? (isDark ? business?.logo_dark_url : business?.logo_light_url) ?? null
    : null;

  const content = (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      {tenantSrc ? (
        <img
          src={tenantSrc}
          alt={business?.name || 'Workspace'}
          className={cn(sizeMap[size], 'object-contain animate-brand-pulse')}
        />
      ) : (
        <Logo className={cn(sizeMap[size], 'object-contain animate-brand-pulse')} variant="auto" />
      )}
      {text && (
        <p className="text-sm text-muted-foreground font-medium animate-pulse">
          {text}
        </p>
      )}
    </div>
  );

  if (overlay) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
        {content}
      </div>
    );
  }

  return content;
}
