import { WifiOff } from 'lucide-react';

export function StatusBadge({ online, label }: { online: boolean; label?: string }) {
  return <span className={`status-badge ${online ? '' : 'status-badge--offline'}`}>
    {online ? <span className="status-dot" /> : <WifiOff size={13} aria-hidden="true" />}
    {label ?? (online ? 'Online' : 'Offline')}
  </span>;
}
