import React, { ErrorInfo } from 'react';
import { useTranslation } from 'react-i18next';

interface ErrorBoundaryState {
  hasError: boolean;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
  };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('App error boundary caught an error', error, errorInfo);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  public render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <ErrorFallback onRetry={this.handleRetry} onReload={this.handleReload} />
      );
    }

    return this.props.children;
  }
}

function ErrorFallback({
  onRetry,
  onReload,
}: {
  onRetry: () => void;
  onReload: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="app-error-boundary">
      <div className="app-error-boundary-card">
        <h1>{t('appErrorBoundary.title')}</h1>
        <p>{t('appErrorBoundary.description')}</p>
        <div className="app-error-boundary-actions">
          <button type="button" className="secondary-btn" onClick={onRetry}>
            {t('appErrorBoundary.retry')}
          </button>
          <button type="button" className="primary-btn" onClick={onReload}>
            {t('appErrorBoundary.reload')}
          </button>
        </div>
      </div>
    </div>
  );
}
