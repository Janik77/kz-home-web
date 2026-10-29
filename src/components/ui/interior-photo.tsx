import { useState } from 'react';
import { DoorOpen } from 'lucide-react';

/** Decorative local photography with a stable photo-free fallback. */
export function InteriorPhoto({ src, position = 'center', className = '', eager = false }: { src?: string; position?: string; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState('');
  const available = Boolean(src && failed !== src);
  return <div className={`interior-photo ${available ? '' : 'interior-photo--empty'} ${className}`} aria-hidden="true">
    {available ? <img src={src} alt="" style={{ objectPosition: position }} loading={eager ? 'eager' : 'lazy'} onError={() => setFailed(src!)} /> : <DoorOpen size={32} />}
  </div>;
}
