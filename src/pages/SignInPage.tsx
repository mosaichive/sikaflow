import { useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Provider } from '@supabase/supabase-js';
import { Apple, Chrome, Loader2 } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type AuthMode = 'sign-in' | 'sign-up';

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-10">
        <div className="grid w-full gap-8 lg:grid-cols-[0.9fr_1fr] lg:items-center">
          <section className="hidden space-y-6 lg:block">
            <div className="flex items-center gap-3">
              <Logo className="h-11 w-11" />
              <div>
                <p className="text-sm font-semibold tracking-tight">SikaFlow</p>
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Sales tally system</p>
              </div>
            </div>
            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Business workspace</p>
              <h1 className="max-w-xl text-4xl font-bold leading-tight tracking-normal">
                Simple sales, stock, and cash control for daily business.
              </h1>
              <p className="max-w-lg text-base leading-7 text-muted-foreground">
                Sign in or start a 30-day trial. Pricing stays out of setup so you can get to the dashboard first.
              </p>
            </div>
          </section>

          <section className="mx-auto w-full max-w-md rounded-lg border border-border bg-card/70 p-4 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center gap-3 lg:hidden">
              <Logo className="h-10 w-10" />
              <div>
                <p className="text-sm font-semibold">SikaFlow</p>
                <p className="text-xs text-muted-foreground">Sales tally system</p>
              </div>
            </div>
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}

function AuthPanel({ initialMode }: { initialMode: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<Provider | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const redirectTo = useMemo(() => {
    if (typeof window === 'undefined') return '/dashboard';
    return `${window.location.origin}/dashboard`;
  }, []);

  const afterAuthPath = useMemo(() => {
    const from = (location.state as { from?: string } | null)?.from;
    return from && !from.startsWith('/sign-') && from !== '/auth' ? from : '/dashboard';
  }, [location.state]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError('');
    navigate(nextMode === 'sign-in' ? '/sign-in' : '/sign-up', { replace: true, state: location.state });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (mode === 'sign-in') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        navigate(afterAuthPath, { replace: true });
        return;
      }

      if (!fullName.trim()) {
        throw new Error('Enter your full name to create the account.');
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: fullName.trim(),
            full_name: fullName.trim(),
          },
          emailRedirectTo: redirectTo,
        },
      });
      if (signUpError) throw signUpError;

      if (data.session) {
        toast({ title: 'Account created', description: 'Your 30-day trial setup starts on the dashboard.' });
        navigate('/dashboard', { replace: true });
        return;
      }

      toast({
        title: 'Confirm your email',
        description: 'Open the confirmation link, then sign in to continue to your dashboard.',
      });
      setMode('sign-in');
      navigate('/sign-in', { replace: true });
    } catch (authError: unknown) {
      const message = authError instanceof Error ? authError.message : 'Authentication failed. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const continueWithOAuth = async (provider: Provider) => {
    setError('');
    setOauthProvider(provider);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (oauthError) {
      setError(oauthError.message);
      setOauthProvider(null);
    }
  };

  return (
    <>
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          {mode === 'sign-in' ? 'Welcome back' : 'Start free'}
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-normal">
          {mode === 'sign-in' ? 'Sign in to SikaFlow' : 'Create your account'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'sign-in'
            ? 'Use your existing business account to continue.'
            : 'Your account opens the dashboard first, then a quick setup dialog.'}
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 rounded-lg border border-border bg-muted p-1">
        <button
          type="button"
          onClick={() => switchMode('sign-in')}
          className={cn(
            'h-9 rounded-md text-sm font-medium transition-colors',
            mode === 'sign-in' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => switchMode('sign-up')}
          className={cn(
            'h-9 rounded-md text-sm font-medium transition-colors',
            mode === 'sign-up' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Sign up
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => void continueWithOAuth('google')}
          disabled={submitting || !!oauthProvider}
        >
          {oauthProvider === 'google' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Chrome className="h-4 w-4" />}
          Google
        </Button>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => void continueWithOAuth('apple')}
          disabled={submitting || !!oauthProvider}
        >
          {oauthProvider === 'apple' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Apple className="h-4 w-4" />}
          Apple
        </Button>
      </div>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or use email</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form className="space-y-4" onSubmit={submit}>
        {mode === 'sign-up' && (
          <div className="space-y-2">
            <Label htmlFor="full-name">Full name</Label>
            <Input
              id="full-name"
              autoComplete="name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Ama Mensah"
              required
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@business.com"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            required
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" className="w-full" disabled={submitting || !!oauthProvider}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </Button>
      </form>

      {mode === 'sign-up' && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          New businesses start with a 30-day free trial. No card required.
        </p>
      )}
    </>
  );
}

export function SignInPage() {
  return (
    <AuthShell>
      <AuthPanel initialMode="sign-in" />
    </AuthShell>
  );
}

export function SignUpPage() {
  return (
    <AuthShell>
      <AuthPanel initialMode="sign-up" />
    </AuthShell>
  );
}
