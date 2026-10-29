import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import type { Device } from '../../domain/home';
import { CoreControlNotice } from './core-control-notice';

const relay: Device = { id: 'relay', roomId: 'room', name: 'Relay', kind: 'relay', connection: 'online', favorite: false, on: false };

it('explains unavailable confirmation without inferring denial from a successful read', async () => {
  render(<CoreControlNotice device={relay} locale="ru" />);
  await userEvent.click(screen.getByText('Почему управление недоступно'));
  expect(screen.getByText('Управление Core остаётся в режиме просмотра.')).toBeVisible();
  expect(screen.getByText(/Результат команды пока нельзя надёжно проверить/)).toBeVisible();
  expect(screen.getByText(/Права на управление из этих данных не определяются/)).toBeVisible();
  expect(screen.queryByRole('switch')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
});

it.each([
  [{ ...relay, connection: 'offline', on: true } as Device, 'Core reports this device offline.'],
  [{ ...relay, kind: 'other', typeLabel: 'relay', readings: [] } as Device, 'Web has no supported control for this reported data.'],
])('gives an offline or unsupported reason without claiming a command failure', async (device, reason) => {
  render(<CoreControlNotice device={device} />);
  await userEvent.click(screen.getByText('Why controls are unavailable'));
  expect(screen.getByText(reason)).toBeVisible();
  expect(screen.getByText(/matching state does not confirm/)).toBeVisible();
  expect(screen.queryByRole('status')).toBeNull();
});
