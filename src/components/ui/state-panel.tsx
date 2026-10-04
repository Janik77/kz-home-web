import { CircleAlert, Layers, LoaderCircle } from 'lucide-react';
import { Button } from './button';

interface StatePanelProps {
  kind: 'empty' | 'error' | 'loading';
  title: string;
  description?: string;
  onRetry?: () => void;
}

export function StatePanel({ kind, title, description, onRetry }: StatePanelProps) {
  const Icon = kind === 'error' ? CircleAlert : kind === 'loading' ? LoaderCircle : Layers;
  return (
    <div className={`state-panel state-panel--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon size={28} aria-hidden="true" className={kind === 'loading' ? 'spin' : ''} />
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function InlineError({ message }: { message: string }) {
  return <p className="inline-error" role="alert"><CircleAlert size={17} aria-hidden="true" />{message}</p>;
}
