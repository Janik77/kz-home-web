import { Blinds, Lightbulb, Plug, Thermometer } from 'lucide-react';
import type { Device, DeviceCommand } from '../../domain/home';
import { describeDevice, isActive } from '../../domain/selectors';
import { Switch } from '../../components/ui/switch';
import { RangeControl } from '../../components/ui/range-control';
import { StatusBadge } from '../../components/ui/status-badge';
import { Feedback } from '../../components/ui/feedback';
import { Button } from '../../components/ui/button';

const icons = { light: Lightbulb, relay: Plug, curtain: Blinds, sensor: Thermometer };
const labels = { light: 'Light', relay: 'Power', curtain: 'Curtain', sensor: 'Sensor' };

interface DeviceCardProps {
  device: Device;
  roomName: string;
  busy: boolean;
  operation: 'idle' | 'pending' | 'success' | 'error';
  revision: string;
  onCommand: (command: DeviceCommand) => void;
  onRetry: () => void;
}

export function DeviceCard({ device, roomName, busy, operation, revision, onCommand, onRetry }: DeviceCardProps) {
  const offline = device.connection === 'offline';
  const active = isActive(device);
  const Icon = icons[device.kind];
  return <article id={`device-${device.id}`} className={`device-card ${active ? 'device-card--active' : ''} ${offline ? 'device-card--offline' : ''} ${operation === 'pending' ? 'device-card--pending' : ''}`}
    aria-label={`${device.name} in ${roomName}`} tabIndex={-1}>
    <div className="device-card__top"><span className="device-card__icon"><Icon size={23} aria-hidden="true" /></span>
      {(device.kind === 'light' || device.kind === 'relay') && <Switch checked={device.on} label={`${device.name} in ${roomName}`} disabled={offline} busy={busy}
        onChange={(on) => onCommand({ type: 'set-power', deviceId: device.id, on })} />}
      {(device.kind === 'curtain' || device.kind === 'sensor') && <span className="device-card__type">{labels[device.kind]}</span>}
    </div>
    <p className="device-card__room">{roomName}</p><h3>{device.name}</h3>
    <div className="device-card__connection"><StatusBadge online={!offline} />{device.kind === 'sensor' && <span>Read only</span>}</div>
    <p className="device-card__state">{describeDevice(device)}</p>
    {device.kind === 'light' && !offline && <RangeControl label="Brightness" accessibleLabel={`${device.name} brightness in ${roomName}`} value={device.brightness} disabled={busy} revision={revision}
      onCommit={(brightness) => onCommand({ type: 'set-brightness', deviceId: device.id, brightness })} />}
    {device.kind === 'curtain' && !offline && <RangeControl label="Open amount" accessibleLabel={`${device.name} open amount in ${roomName}`} value={device.position} disabled={busy} revision={revision}
      onCommit={(position) => onCommand({ type: 'set-position', deviceId: device.id, position })} />}
    {device.kind === 'relay' && !offline && <p className="device-card__footnote">{device.on ? 'Switch off to stop power to this outlet.' : 'Switch on to supply power to this outlet.'}</p>}
    {device.kind === 'sensor' && !offline && <p className="device-card__footnote">Measured {new Date(device.measuredAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
    {offline && <p className="device-card__footnote">Last known: {describeDevice({ ...device, connection: 'online' })}. Reconnect this device to use its controls.</p>}
    <div className="device-card__feedback">
      {operation === 'pending' && <Feedback tone="pending" message="Updating… Waiting for confirmation." />}
      {operation === 'success' && <Feedback tone="success" message="Update confirmed." />}
      {operation === 'error' && <Feedback tone="error" message="Couldn’t update this device. Its last confirmed state is shown.">
        <Button variant="quiet" aria-disabled={busy || offline} onClick={() => { if (!busy && !offline) onRetry(); }}>Try again</Button>
      </Feedback>}
    </div>
  </article>;
}
