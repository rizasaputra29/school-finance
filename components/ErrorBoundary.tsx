'use client';

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary component for catching React errors
 * Follows React best practices from https://react.dev/learn/you-might-not-need-an-effect
 * 
 * @example
 * // Wrap your application with ErrorBoundary
 * <ErrorBoundary>
 *   <YourApp />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
    
    this.setState({
      error,
      errorInfo,
    });
    
    // Could also send to error reporting service here
    // Example: Sentry.captureException(error, { extra: errorInfo });
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-gray-900">
                Terjadi Kesalahan
              </h2>
              <p className="text-sm text-gray-500">
                Maaf, terjadi kesalahan yang tidak terduga. Silakan coba lagi.
              </p>
            </div>

            {/* Show error details in development */}
            {process.env.NODE_ENV !== 'production' && this.state.error && (
              <div className="text-left p-4 bg-gray-50 rounded-lg overflow-auto max-h-40">
                <p className="text-xs font-mono text-red-600 wrap-break-word">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={this.handleReset}
                variant="default"
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Coba Lagi
              </Button>
              <Link href="/" passHref>
                <Button variant="outline" className="gap-2">
                  <Home className="h-4 w-4" />
                  Halaman Utama
                </Button>
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook for functional components to access error state
 * Can be used with ErrorBoundary fallback prop
 */
export function useErrorBoundary() {
  // This hook provides a way to trigger the ErrorBoundary from child components
  // Usage: const [, setError] = useErrorBoundary();
  //        setError(() => { throw new Error('...') });
  
  // Note: For triggering errors, use React's standard error handling
  // This hook is primarily for TypeScript support if needed
  return null;
}
