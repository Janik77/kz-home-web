import { Blinds, Lightbulb, Plug, Thermometer, WifiOff } from 'lucide-react';
import type { Device, DeviceCommand } from '../../domain/home';
import { describeDevice, isActive } from '../../domain/selectors';
import { Switch } from '../../components/ui/switch';
import { RangeControl } from '../../components/ui/range-control';

const icons = { light: Lightbulb, relay: Plug, curtain: Blinds, sensor: Thermometer };

export function DeviceCard({ device, roomName, busy, onCommand }: { device: Device; roomName: string; busy: boolean; onCommand: (command: DeviceCommand) => void }) {
  const offline = device.connection === 'offline';
  const active = isActive(device);
  const Icon = icons[device.kind];
  return <article className={`device-card ${active ? 'device-card--active' : ''} ${offline ? 'device-card--offline' : ''}`} aria-label={`${device.name} in ${roomName}`}>
    <div className="device-card__top"><span className="device-card__icon"><Icon size={23} aria-hidden="true" /></span>
      {(device.kind === 'light' || device.kind === 'relay') && <Switch checked={device.on} label={`${device.name} in ${roomName}`} disabled={offline || busy}
        onChange={(on) => onCommand({ type: 'set-power', deviceId: device.id, on })} />}
      {device.kind === 'curtain' && <span className="device-card__type">CURTAIN</span>}
      {device.kind === 'sensor' && <span className="device-card__type">SENSOR</span>}
    </div>
    <p className="device-card__room">{roomName}</p><h3>{device.name}</h3>
    <p className="device-card__state">{offline && <WifiOff size={14} aria-hidden="true" />}{describeDevice(device)}</p>
    {device.kind === 'light' && !offline && <RangeControl key={`${device.id}-${device.brightness}`} label="Brightness" accessibleLabel={`${device.name} brightness in ${roomName}`} value={device.brightness} disabled={busy}
      onCommit={(brightness) => onCommand({ type: 'set-brightness', deviceId: device.id, brightness })} />}
    {device.kind === 'curtain' && !offline && <RangeControl key={`${device.id}-${device.position}`} label="Open amount" accessibleLabel={`${device.name} open amount in ${roomName}`} value={device.position} disabled={busy}
      onCommit={(position) => onCommand({ type: 'set-position', deviceId: device.id, position })} />}
    {device.kind === 'relay' && !offline && <div className="device-card__footnote"><span className={`status-dot ${device.on ? '' : 'status-dot--muted'}`} />{device.on ? 'Power is on' : 'Ready when you are'}</div>}
    {device.kind === 'sensor' && !offline && <p className="device-card__footnote">Sample reading · {new Date(device.measuredAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
    {offline && <p className="device-card__footnote">Controls available when connected</p>}
  </article>;
}
