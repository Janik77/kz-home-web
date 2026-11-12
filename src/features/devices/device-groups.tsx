import { useId } from 'react';
import type { Device, Room } from '../../domain/home';
import { SectionHeading } from '../../components/ui/section-heading';
import { DeviceGrid } from './device-grid';

const groups: { kind: Device['kind']; label: string }[] = [
  { kind: 'light', label: 'Освещение' }, { kind: 'curtain', label: 'Шторы' },
  { kind: 'relay', label: 'Питание' }, { kind: 'sensor', label: 'Климат и датчики' },
  { kind: 'other', label: 'Данные устройств' },
];

export function DeviceGroups({ devices, rooms }: { devices: Device[]; rooms: Room[] }) {
  const id = useId();
  if (!devices.length) return <DeviceGrid devices={devices} rooms={rooms} />;
  return <div className="device-groups">{groups.map(({ kind, label }) => {
    const items = devices.filter((device) => device.kind === kind);
    if (!items.length) return null;
    const headingId = `${id}-${kind}`;
    return <section key={kind} aria-labelledby={headingId}><SectionHeading id={headingId} title={label}
      action={<span className="section-count">{items.length}</span>} />
      <DeviceGrid devices={items} rooms={rooms} />
    </section>;
  })}</div>;
}
