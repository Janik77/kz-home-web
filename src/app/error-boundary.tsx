import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { StatePanel } from '../components/ui/state-panel';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error('KZ Home render error', error, info.componentStack);
  }
  render() {
    if (this.state.failed) return <main className="fatal-error"><StatePanel kind="error" title="Something didn’t go as planned" description="Reload KZ Home to try again." onRetry={() => window.location.reload()} /></main>;
    return this.props.children;
  }
}
