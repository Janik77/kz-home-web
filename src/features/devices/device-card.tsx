import { Blinds, Lightbulb, Plug, Thermometer, Radio } from 'lucide-react';
import type { Device, DeviceCommand } from '../../domain/home';
import { describeDevice, isActive } from '../../domain/selectors';
import { Switch } from '../../components/ui/switch';
import { RangeControl } from '../../components/ui/range-control';
import { StatusBadge } from '../../components/ui/status-badge';
import { Feedback } from '../../components/ui/feedback';
import { Button } from '../../components/ui/button';
import { CoreControlNotice } from './core-control-notice';
import { ConfirmedRelayControl } from './confirmed-relay-control';

const icons = { light: Lightbulb, relay: Plug, curtain: Blinds, sensor: Thermometer, other: Radio };
const labels = { light: 'Светлая', relay: 'Питание', curtain: 'Curtain', sensor: 'Датчик', other: 'Устройство' };

interface DeviceCardProps {
  device: Device;
  roomName: string;
  busy: boolean;
  readOnly: boolean;
  operation: 'idle' | 'pending' | 'success' | 'error';
  revision: string;
  onCommand: (command: DeviceCommand) => void;
  onRetry: () => void;
}

export function DeviceCard({ device, roomName, busy, readOnly, operation, revision, onCommand, onRetry }: DeviceCardProps) {
  const offline = device.connection === 'offline';
  const active = isActive(device);
  const Icon = icons[device.kind];
  return <article id={`device-${device.id}`} className={`device-card ${active ? 'device-card--active' : ''} ${offline ? 'device-card--offline' : ''} ${operation === 'pending' ? 'device-card--pending' : ''}`}
    aria-label={`${device.name} · ${roomName}`} tabIndex={-1}>
    <div className="device-card__top"><span className="device-card__icon"><Icon size={23} aria-hidden="true" /></span>
      {!readOnly && (device.kind === 'light' || device.kind === 'relay') && <Switch checked={device.on} label={`${device.name} · ${roomName}`} disabled={offline} busy={busy}
        onChange={(on) => onCommand({ type: 'set-power', deviceId: device.id, on })} />}
      {(readOnly || device.kind === 'curtain' || device.kind === 'sensor' || device.kind === 'other') && <span className="device-card__type">{device.kind === 'other' ? device.typeLabel : labels[device.kind]}</span>}
    </div>
    <p className="device-card__room">{roomName}</p><h3>{device.name}</h3>
    <div className="device-card__connection"><StatusBadge online={!offline} label={readOnly ? (offline ? 'По данным Core: не в сети' : 'По данным Core: в сети') : (offline ? 'Не в сети' : 'В сети')} />{(readOnly || device.kind === 'sensor' || device.kind === 'other') && <span>{readOnly ? 'Данные Core' : 'Только просмотр'}</span>}</div>
    <p className="device-card__state">{describeDevice(device)}</p>
    {readOnly && <CoreControlNotice device={device} />}
    {readOnly && <ConfirmedRelayControl key={device.id} device={device} />}
    {device.kind === 'light' && device.brightness !== null && !readOnly && !offline && <RangeControl label="Яркость" accessibleLabel={`${device.name} · яркость · ${roomName}`} value={device.brightness} disabled={busy} revision={revision}
      onCommit={(brightness) => onCommand({ type: 'set-brightness', deviceId: device.id, brightness })} />}
    {device.kind === 'curtain' && !readOnly && !offline && <RangeControl label="Открытие" accessibleLabel={`${device.name} · открытие · ${roomName}`} value={device.position} disabled={busy} revision={revision}
      onCommit={(position) => onCommand({ type: 'set-position', deviceId: device.id, position })} />}
    {device.kind === 'relay' && !readOnly && !offline && <p className="device-card__footnote">{device.on ? 'Выключите, чтобы отключить питание розетки.' : 'Включите, чтобы подать питание на розетку.'}</p>}
    {device.kind === 'sensor' && !offline && <p className="device-card__footnote">Демо-показание · {new Date(device.measuredAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
    {offline && <p className="device-card__footnote">Последнее состояние: {describeDevice({ ...device, connection: 'online' })}.{!readOnly && ' Управление станет доступно после восстановления связи.'}</p>}
    <div className="device-card__feedback">
      {!readOnly && operation === 'pending' && <Feedback tone="pending" message="Обновляем симуляцию…" />}
      {!readOnly && operation === 'success' && <Feedback tone="success" message="Симуляция обновлена." />}
      {!readOnly && operation === 'error' && <Feedback tone="error" message="Не удалось обновить симуляцию. Показано последнее подтверждённое демо-состояние.">
        <Button variant="quiet" aria-disabled={busy || offline} onClick={() => { if (!busy && !offline) onRetry(); }}>Повторить</Button>
      </Feedback>}
    </div>
  </article>;
}
