import { CircleAlert, Layers, LoaderCircle, LockKeyhole } from 'lucide-react';
import { Button } from './button';

interface StatePanelProps {
  kind: 'empty' | 'error' | 'loading' | 'restricted';
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function StatePanel({ kind, title, description, onRetry, retryLabel = 'Try again' }: StatePanelProps) {
  const Icon = kind === 'error' ? CircleAlert : kind === 'restricted' ? LockKeyhole : kind === 'loading' ? LoaderCircle : Layers;
  return (
    <div className={`state-panel state-panel--${kind}`} role={kind === 'error' || kind === 'restricted' ? 'alert' : 'status'}>
      <Icon size={28} aria-hidden="true" className={kind === 'loading' ? 'spin' : ''} />
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {kind === 'loading' && <div className="loading-skeleton" aria-hidden="true"><span /><span /><span /></div>}
      {onRetry && <Button variant="secondary" onClick={onRetry}>{retryLabel}</Button>}
    </div>
  );
}

export function InlineError({ message }: { message: string }) {
  return <p className="inline-error" role="alert"><CircleAlert size={17} aria-hidden="true" />{message}</p>;
}
