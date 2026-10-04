import { Check, CircleAlert, LoaderCircle, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';

export type FeedbackTone = 'pending' | 'success' | 'warning' | 'error' | 'offline';

export function Feedback({ tone, message, children }: { tone: FeedbackTone; message: string; children?: ReactNode }) {
  const Icon = tone === 'pending' ? LoaderCircle : tone === 'success' ? Check : tone === 'offline' ? WifiOff : CircleAlert;
  return <div className={`feedback feedback--${tone}`} role={tone === 'error' ? 'alert' : 'status'} aria-atomic="true">
    <Icon size={17} aria-hidden="true" className={tone === 'pending' ? 'spin' : ''} />
    <div><p>{message}</p>{children}</div>
  </div>;
}
