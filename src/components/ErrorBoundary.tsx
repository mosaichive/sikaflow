import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App crashed:', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    // Hard reload as a last resort to clear any bad state
    setTimeout(() => window.location.reload(), 50);
  };

  handleSignIn = () => {
    window.location.href = '/sign-in';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#0b0b0c',
          color: '#fafafa',
          fontFamily: 'Montserrat, system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'rgba(255,255,255,0.06)',
              margin: '0 auto 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
            }}
          >
            ⚠️
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>
            Something went wrong loading the app.
          </h1>
          <p style={{ fontSize: 14, opacity: 0.7, margin: '0 0 24px', lineHeight: 1.55 }}>
            {this.state.error?.message ||
              'An unexpected error occurred while starting SikaFlow.'}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={this.handleRetry}
              style={{
                padding: '10px 20px',
                borderRadius: 10,
                background: '#fafafa',
                color: '#0b0b0c',
                border: 'none',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
            <button
              onClick={this.handleSignIn}
              style={{
                padding: '10px 20px',
                borderRadius: 10,
                background: 'transparent',
                color: '#fafafa',
                border: '1px solid rgba(255,255,255,0.15)',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Go to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }
}
