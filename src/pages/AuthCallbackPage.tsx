import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { BrandLoader } from '@/components/BrandLoader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

function mapOAuthCallbackError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes('provider is not enabled')) {
    return 'This sign-in method is not enabled in Supabase yet. Turn on the provider and add the Vercel callback URL.';
  }
  if (normalized.includes('redirect') && normalized.includes('url')) {
    return 'The OAuth callback URL is not allowed yet. Add your Vercel URL to Supabase Auth redirect URLs and try again.';
  }
  return message;
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const next = params.get('next');
    return next && next.startsWith('/') ? next : '/dashboard';
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;

    async function completeOAuth() {
      const params = new URLSearchParams(location.search);
      const providerError = params.get('error_description') || params.get('error');
      if (providerError) {
        if (!cancelled) setError(mapOAuthCallbackError(providerError));
        return;
      }

      const code = params.get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          if (!cancelled) setError(mapOAuthCallbackError(exchangeError.message));
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        navigate(nextPath, { replace: true });
        return;
      }

      if (!cancelled) {
        setError('We could not finish sign-in. Please try again.');
      }
    }

    void completeOAuth();

    return () => {
      cancelled = true;
    };
  }, [location.search, navigate, nextPath]);

  if (!error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <BrandLoader text="Completing sign-in..." size="md" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button className="w-full" onClick={() => navigate('/sign-in', { replace: true })}>
          Back to sign in
        </Button>
      </div>
    </div>
  );
}
