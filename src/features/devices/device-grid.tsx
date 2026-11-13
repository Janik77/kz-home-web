import type { Device, Room } from '../../domain/home';
import { StatePanel } from '../../components/ui/state-panel';
import { DeviceCard } from './device-card';
import { useHomeControls } from '../home/use-home';

export function DeviceGrid({ devices, rooms }: { devices: Device[]; rooms: Room[] }) {
  const { command, scene, pending, readOnly } = useHomeControls();
  if (!devices.length) return <StatePanel kind="empty" title="Устройств пока нет" description="Устройства появятся после добавления в дом." />;
  return <>
    <div className="device-grid">
      {devices.map((device) => {
        const selected = command.variables?.deviceId === device.id;
        return <DeviceCard key={device.id} device={device} roomName={rooms.find((room) => room.id === device.roomId)?.name ?? 'Комната не указана'} busy={pending} readOnly={readOnly}
          operation={selected ? command.status : 'idle'} revision={`${selected ? `${command.submittedAt}-${command.status}` : ''}:${scene.submittedAt}:${scene.status}`} 
          onCommand={(input) => command.mutate(input)} onRetry={() => { if (command.variables) command.mutate(command.variables); }} />;
      })}
    </div>
  </>;
}
