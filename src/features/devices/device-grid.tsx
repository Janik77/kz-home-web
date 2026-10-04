import type { Device, Room } from '../../domain/home';
import { InlineError, StatePanel } from '../../components/ui/state-panel';
import { DeviceCard } from './device-card';
import { useHomeControls } from '../home/use-home';

export function DeviceGrid({ devices, rooms }: { devices: Device[]; rooms: Room[] }) {
  const { command, pending } = useHomeControls();
  if (!devices.length) return <StatePanel kind="empty" title="Room for something new" description="Devices will appear here once they are added to your home." />;
  return <>
    <div className="device-grid" aria-busy={pending}>
      {devices.map((device) => <DeviceCard key={`${device.id}-${command.isError ? 'error' : 'ready'}`} device={device} roomName={rooms.find((room) => room.id === device.roomId)?.name ?? 'Unassigned room'} busy={pending} onCommand={(input) => command.mutate(input)} />)}
    </div>
    <div className="sr-only" role="status">{command.isPending ? 'Updating device.' : command.isSuccess ? 'Device updated.' : ''}</div>
    {command.isError && <InlineError message={command.error.message} />}
  </>;
}
