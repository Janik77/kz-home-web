import { createBrowserRouter, createRoutesFromElements, Link, Route, RouterProvider } from 'react-router';
import { useEffect, useState } from 'react';
import { DraftGuard } from './draft-guard';
import { DevicesPage } from '../features/devices/devices-page';
import { AutomationsPage, EventsPage } from '../features/activity/activity-page';
import { AppShell } from './app-shell';
import { HomePage } from '../features/home/home-page';
import { RoomsPage } from '../features/rooms/rooms-page';
import { RoomPage } from '../features/rooms/room-page';
import { ScenesPage } from '../features/scenes/scenes-page';
import { SettingsPage } from '../features/settings/settings-page';
import { StatePanel } from '../components/ui/state-panel';

const routes = createRoutesFromElements(<Route element={<DraftGuard><AppShell /></DraftGuard>}>
    <Route index element={<HomePage />} />
    <Route path="rooms" element={<RoomsPage />} />
    <Route path="rooms/:roomId" element={<RoomPage />} />
    <Route path="scenes" element={<ScenesPage />} />
    <Route path="devices" element={<DevicesPage />} />
    <Route path="automations" element={<AutomationsPage />} />
    <Route path="events" element={<EventsPage />} />
    <Route path="settings" element={<SettingsPage />} />
    <Route path="*" element={<><StatePanel kind="empty" title="Страница не найдена" description="Вернитесь на главную страницу." /><Link className="button button--primary" to="/">На главную</Link></>} />
  </Route>);

// Reuse during StrictMode initialization, dispose after the last mounted App.
let browserRouter: ReturnType<typeof createBrowserRouter> | undefined;
let mounts = 0;
export function App() {
  const [router] = useState(() => browserRouter ??= createBrowserRouter(routes));
  useEffect(() => {
    mounts += 1;
    return () => {
      mounts -= 1;
      queueMicrotask(() => {
        if (mounts === 0 && browserRouter === router) { router.dispose(); browserRouter = undefined; }
      });
    };
  }, [router]);
  return <RouterProvider router={router} />;
}
