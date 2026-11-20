import { useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import type { PluginListenerHandle } from '@capacitor/core';
import { CoreWorkspace } from '../app/core-workspace';
import { Button } from '../components/ui/button';
import { ThemeToggle } from '../components/ui/theme-toggle';
import { createServices } from '../data/create-services';
import { HttpClient } from '../data/core/http-client';
import { parseLanCore } from './endpoint';
import { nativeCoreFetcher } from './transport';
import { forgetEndpoint, nativeRefreshVault, rememberedHome, rememberHome } from './store';
import type { RememberedHome } from './store';
import { mobileReadRefresh } from './read-refresh';
import { checkCoreHealth, checkCoreReadiness, createStoredSessionResume } from './stored-session-resume';
import './android.css';

function usePhoneLifecycle() {
  const [wifi, setWifi] = useState<boolean | null>(null);
  useEffect(() => {
    let disposed = false;
    let active = true;
    let previousWifi: boolean | undefined;
    let foregroundRefreshPending = false;
    let networkRevision = 0;
    const handles: PluginListenerHandle[] = [];
    const keep = (promise: Promise<PluginListenerHandle>) => {
      void promise.then(handle => { if (disposed) return handle.remove(); handles.push(handle); }).catch(() => undefined);
    };
    const sync = (status: Awaited<ReturnType<typeof Network.getStatus>>) => {
      if (disposed) return;
      const ready = status.connected && status.connectionType === 'wifi';
      const returnedToWifi = previousWifi === false;
      previousWifi = ready;
      setWifi(ready);
      if (ready && active && (foregroundRefreshPending || returnedToWifi)) {
        foregroundRefreshPending = false;
        window.dispatchEvent(new Event(mobileReadRefresh));
      }
    };
    keep(Network.addListener('networkStatusChange', status => { networkRevision++; sync(status); }));
    const refreshStatus = (resume: boolean) => {
      // Android may deliver a fresh capabilities event before this getStatus resolves.
      // That fresh event can satisfy the foreground intent; never trust the stale promise.
      if (resume) foregroundRefreshPending = true;
      const revision = networkRevision;
      void Network.getStatus().then(status => {
        if (revision === networkRevision) sync(status);
      }).catch(() => {
        if (!disposed && revision === networkRevision) setWifi(false);
      });
    };
    refreshStatus(false);
    keep(App.addListener('appStateChange', ({ isActive }) => {
      active = isActive;
      if (active) refreshStatus(true);
    }));
    keep(App.addListener('backButton', () => {
      const focus = document.activeElement;
      if (focus instanceof HTMLInputElement || focus instanceof HTMLTextAreaElement) {
        focus.blur();
      } else if (Number(history.state?.idx ?? 0) > 0) {
        history.back(); // Shared router still owns navigation and unsaved-draft blockers.
      } else {
        void App.minimizeApp();
      }
    }));
    return () => { disposed = true; handles.forEach(handle => { void handle.remove(); }); };
  }, []);
  return wifi;
}

export function AndroidWorkspace() {
  const [connection, setConnection] = useState<(RememberedHome & { restore: boolean }) | null | undefined>(undefined);
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saved = useRef<RememberedHome | null>(null);
  const wifi = usePhoneLifecycle();
  useEffect(() => {
    let current = true;
    void rememberedHome().then(home => {
      if (!current) return;
      const verified = home ? { ...home, origin: parseLanCore(home.origin) } : null;
      saved.current = verified;
      setConnection(verified ? { ...verified, restore: true } : null);
    }).catch(() => {
      if (current) { setError('Не удалось открыть сохранённый дом. Укажите его адрес заново.'); setConnection(null); }
    });
    return () => { current = false; };
  }, []);

  async function connect() {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const origin = parseLanCore(address);
      const connectivity = await Network.getStatus();
      if (!connectivity.connected || connectivity.connectionType !== 'wifi') {
        setError('Подключитесь к домашнему Wi‑Fi и повторите попытку.');
        return;
      }
      try {
        await checkCoreHealth(new HttpClient(origin, nativeCoreFetcher(origin)));
      } catch {
        setError('Не удалось проверить Core. Проверьте адрес, домашний Wi‑Fi и сертификат HTTPS.');
        return;
      }
      await forgetEndpoint();
      const next = { origin };
      await rememberHome(next);
      saved.current = next; setConnection({ ...next, restore: false });
    } catch (failure) {
      setError(failure instanceof Error && failure.message.startsWith('Введите') ? failure.message
        : 'Не удалось сохранить адрес. Проверьте адрес и защищённое хранилище Android.');
    } finally { setBusy(false); }
  }

  const change = async () => {
    setError('');
    try {
      await forgetEndpoint();
      saved.current = null; setConnection(null); setAddress('');
    } catch { setError('Не удалось удалить старое подключение. Очистите данные приложения.'); }
  };

  return <div className="kz-native">
    {wifi === false && <p role="status" className="kz-native__offline">Нет связи с домом. Подключитесь к домашнему Wi‑Fi.</p>}
    {connection && error && <p className="kz-native__connection-error kz-native__connection-error--top" role="alert">{error}</p>}
    {connection === undefined ? <main className="session-page"><p role="status">Проверяем подключение…</p></main>
      : connection ? <AndroidHome key={connection.origin} connection={connection} restore={connection.restore}
          wifi={wifi} onChange={change}
          onRemember={(accountId, houseId) => {
            if (saved.current?.origin !== connection.origin) return;
            const next = { origin: connection.origin, accountId, houseId };
            saved.current = next; void rememberHome(next).catch(() => undefined);
          }} remembered={() => saved.current} />
        : <main className="app-shell--everyday session-page"><div className="session-card">
          <div className="session-card__brand"><p className="eyebrow">KZ HOME</p><ThemeToggle /></div>
          <h1>Подключить дом</h1>
          <p>Укажите HTTPS-адрес Core. ПК и телефон должны быть подключены к домашней сети.</p>
          {error && <p className="kz-native__connection-error" role="alert">{error}</p>}
          <form className="login-form" onSubmit={event => { event.preventDefault(); void connect(); }}>
            <label htmlFor="core-address">Адрес Core
              <input id="core-address" type="url" autoCapitalize="off" autoComplete="off" placeholder="https://192.168.1.20:8443" required value={address} onChange={event => setAddress(event.target.value)} />
            </label>
            <Button type="submit" disabled={busy}>{busy ? 'Подключаем…' : 'Продолжить'}</Button>
          </form>
        </div></main>}
  </div>;
}

function AndroidHome({ connection, restore, wifi, onChange, remembered, onRemember }: {
  connection: RememberedHome;
  restore: boolean;
  wifi: boolean | null;
  onChange: () => Promise<void>;
  remembered: () => RememberedHome | null;
  onRemember: (accountId: string, houseId: string) => void;
}) {
  const [{ services, resumeStored }] = useState(() => {
    const transport = nativeCoreFetcher(connection.origin);
    const network: typeof fetch = async (input, options) => {
      const status = await Network.getStatus();
      if (!status.connected || status.connectionType !== 'wifi') throw new TypeError('Home Wi-Fi required');
      options?.signal?.throwIfAborted();
      return transport(input, options);
    };
    const services = createServices({ mode: 'core', apiUrl: connection.origin }, network, nativeRefreshVault(connection.origin));
    const resumeStored = services.mode === 'core' ? createStoredSessionResume(
      () => checkCoreReadiness(new HttpClient(connection.origin, network)), () => services.session.resume(),
    ) : null;
    return { services, resumeStored };
  });
  const eligible = useRef(false);
  const optedOut = useRef(false);
  useEffect(() => {
    if (services.mode !== 'core') return;
    // Never resurrect an earlier session after the user starts a new one or signs out.
    const observe = () => { if (services.session.getSnapshot().status !== 'anonymous') optedOut.current = true; };
    observe();
    return services.session.subscribe(observe);
  }, [services]);
  useEffect(() => {
    if (!restore || wifi !== true || services.mode !== 'core' || !resumeStored) return;
    eligible.current = true;
    const attempt = () => { void resumeStored(() => eligible.current && !optedOut.current
      && services.session.getSnapshot().status === 'anonymous').catch(() => undefined); };
    attempt();
    window.addEventListener(mobileReadRefresh, attempt);
    return () => {
      eligible.current = false;
      window.removeEventListener(mobileReadRefresh, attempt);
    };
  }, [restore, resumeStored, services, wifi]);
  if (services.mode !== 'core') return null;
  return <CoreWorkspace services={services} mobile={{
    address: connection.origin, onChangeConnection: () => { optedOut.current = true; return onChange(); },
    rememberedHouse: accountId => {
      const item = remembered();
      return item?.origin === connection.origin && item.accountId === accountId ? item.houseId ?? null : null;
    },
    onRememberHouse: onRemember,
  }} />;
}
