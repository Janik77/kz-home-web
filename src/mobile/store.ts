import { registerPlugin } from '@capacitor/core';
import type { RefreshVault } from '../data/core/session';

type StoreKey = 'home' | 'refresh';
type Result = { value?: string | null };
const store = registerPlugin<{
  read(options: { key: 'home' }): Promise<Result>;
  take(options: { key: 'refresh' }): Promise<Result>;
  write(options: { key: StoreKey; value: string }): Promise<void>;
  remove(options: { key: StoreKey }): Promise<void>;
}>('HomeSecureStore');

export type RememberedHome = { origin: string; accountId?: string; houseId?: string };

export async function rememberedHome(): Promise<RememberedHome | null> {
  const { value } = await store.read({ key: 'home' });
  if (!value) return null;
  const parsed = JSON.parse(value) as RememberedHome;
  return typeof parsed.origin === 'string' ? parsed : null;
}

export function rememberHome(profile: RememberedHome) {
  return store.write({ key: 'home', value: JSON.stringify(profile) });
}

export function nativeRefreshVault(origin: string): RefreshVault {
  return {
    async take() {
      const { value } = await store.take({ key: 'refresh' });
      if (!value) return null;
      const item = JSON.parse(value) as { origin?: string; token?: string };
      return item.origin === origin && typeof item.token === 'string' ? item.token : null;
    },
    save(token) { return store.write({ key: 'refresh', value: JSON.stringify({ origin, token }) }); },
    clear() { return store.remove({ key: 'refresh' }); },
  };
}

export async function forgetEndpoint() {
  await store.remove({ key: 'refresh' });
  await store.remove({ key: 'home' });
}
