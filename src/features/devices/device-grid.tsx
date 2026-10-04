import type { Device, Room } from '../../domain/home';
import { StatePanel } from '../../components/ui/state-panel';
import { DeviceCard } from './device-card';
import { useHomeControls } from '../home/use-home';

export function DeviceGrid({ devices, rooms }: { devices: Device[]; rooms: Room[] }) {
  const { command, pending } = useHomeControls();
  if (!devices.length) return <StatePanel kind="empty" title="No devices here yet" description="Devices will appear here once they are added to your home." />;
  return <>
    <div className="device-grid">
      {devices.map((device) => {
        const selected = command.variables?.deviceId === device.id;
        return <DeviceCard key={device.id} device={device} roomName={rooms.find((room) => room.id === device.roomId)?.name ?? 'Unassigned room'} busy={pending}
          operation={selected ? command.status : 'idle'} revision={selected ? `${command.submittedAt}-${command.status}` : ''}
          onCommand={(input) => command.mutate(input)} onRetry={() => { if (command.variables) command.mutate(command.variables); }} />;
      })}
    </div>
  </>;
}
