import { boolean, decodeDevice, list, object, string } from './dtos';
import { CoreError } from './errors';
import type { CoreSession } from './session';

export type CommandStatus = 'queued' | 'dispatched' | 'applied' | 'failed' | 'timed_out';
export interface Receipt {
  command_id: string; correlation_id: string; house_id: string; device_id: string;
  requested_on: boolean; status: CommandStatus; expires_at: string;
  failure_code: string | null;
}
export function decodeReceipt(value: unknown): Receipt {
  const v = object(value);
  if (!['queued', 'dispatched', 'applied', 'failed', 'timed_out'].includes(string(v.status)) ||
    !Number.isFinite(Date.parse(string(v.expires_at))) ||
    !(v.failure_code === null || ['device_rejected', 'device_failed', 'publish_unconfirmed', 'deadline_exceeded'].includes(string(v.failure_code)))) throw new CoreError('protocol');
  return { command_id: string(v.command_id), correlation_id: string(v.correlation_id), house_id: string(v.house_id),
    device_id: string(v.device_id), requested_on: boolean(v.requested_on), status: v.status as CommandStatus,
    expires_at: string(v.expires_at), failure_code: v.failure_code as string | null };
}
const pending = (r: Receipt) => r.status === 'queued' || r.status === 'dispatched';
function pause(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export interface RelayControl {
  eligible(signal: AbortSignal): Promise<string[]>;
  run(deviceId: string, on: boolean, update: (receipt: Receipt) => void, signal: AbortSignal): Promise<Receipt>;
}
export function createRelayControl(session: CoreSession, houseId: string): RelayControl {
  const busy = new Set<string>();
  const path = `/houses/${encodeURIComponent(houseId)}`;
  const eligible = async (signal: AbortSignal) => {
    const user = session.getSnapshot().user;
    if (!user) throw new CoreError('unauthorized');
    // Verified Core v0.15: only owner can enumerate membership; owner includes device.control.
    // Do not infer control from device.read, superuser metadata or a member.read denial.
    const owner = await session.read(`${path}/members`, value => list(value, item => {
      const m = object(item);
      return string(m.house_id) === houseId && string(m.user_id) === user.id && string(m.role) === 'owner';
    }).some(Boolean), signal);
    if (!owner) return [];
    const devices = await session.read(`/devices?house_id=${encodeURIComponent(houseId)}`, value => list(value, decodeDevice), signal);
    signal.throwIfAborted();
    return devices.filter(d => d.type === 'relay' && d.online && d.capabilities.includes('on_off') && typeof d.state.on === 'boolean').map(d => d.id);
  };
  return { eligible, async run(deviceId, on, update, outerSignal) {
    if (busy.has(deviceId)) throw new CoreError('conflict');
    busy.add(deviceId);
    const lifetime = new AbortController();
    const signal = AbortSignal.any([outerSignal, lifetime.signal]);
    const unsubscribe = session.subscribe(() => {
      if (session.getSnapshot().status !== 'authenticated') lifetime.abort();
    });
    try {
      if (!(await eligible(signal)).includes(deviceId)) throw new CoreError('forbidden');
      signal.throwIfAborted();
      const key = crypto.randomUUID();
      let receipt = await session.command(`/v1/devices/${encodeURIComponent(deviceId)}/commands`, { on }, key, decodeReceipt, signal);
      const identity = receipt;
      const check = (r: Receipt) => {
        signal.throwIfAborted();
        if (r.house_id !== houseId || r.device_id !== deviceId || r.requested_on !== on ||
          r.command_id !== identity.command_id || r.correlation_id !== identity.correlation_id || r.expires_at !== identity.expires_at) throw new CoreError('protocol');
      };
      check(receipt); update(receipt);
      // Server deadline is authoritative. One final GET at deadline materializes timeout.
      const end = Math.min(Date.parse(receipt.expires_at), Date.now() + 30_000);
      while (pending(receipt)) {
        await pause(Math.max(0, Math.min(1_000, end - Date.now())), signal);
        receipt = await session.read(`/v1${path}/commands/${encodeURIComponent(identity.command_id)}`, decodeReceipt, signal);
        check(receipt); update(receipt);
        if (pending(receipt) && Date.now() >= end) throw new CoreError('network');
      }
      return receipt;
    } finally { unsubscribe(); busy.delete(deviceId); }
  } };
}
