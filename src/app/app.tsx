import { BrowserRouter, Link, Route, Routes } from 'react-router';
import { AppShell } from './app-shell';
import { HomePage } from '../features/home/home-page';
import { RoomsPage } from '../features/rooms/rooms-page';
import { RoomPage } from '../features/rooms/room-page';
import { ScenesPage } from '../features/scenes/scenes-page';
import { SettingsPage } from '../features/settings/settings-page';
import { StatePanel } from '../components/ui/state-panel';

export function App() {
  return <BrowserRouter><Routes><Route element={<AppShell />}>
    <Route index element={<HomePage />} />
    <Route path="rooms" element={<RoomsPage />} />
    <Route path="rooms/:roomId" element={<RoomPage />} />
    <Route path="scenes" element={<ScenesPage />} />
    <Route path="settings" element={<SettingsPage />} />
    <Route path="*" element={<><StatePanel kind="empty" title="This page isn’t here" description="Let’s get you back to a familiar place." /><Link className="button button--primary" to="/">Go home</Link></>} />
  </Route></Routes></BrowserRouter>;
}
