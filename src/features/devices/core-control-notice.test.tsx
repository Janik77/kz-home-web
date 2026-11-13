import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import type { Device } from '../../domain/home';
import { CoreControlNotice } from './core-control-notice';

const relay: Device = { id: 'relay', roomId: 'room', name: 'Relay', kind: 'relay', connection: 'online', favorite: false, on: false };

it('explains unavailable confirmation without inferring denial from a successful read', async () => {
  render(<CoreControlNotice device={relay} locale="ru" />);
  await userEvent.click(screen.getByText('О состоянии и управлении'));
  expect(screen.getByText('Управление доступно только при подтверждённых правах и поддержке реле.')).toBeVisible();
  expect(screen.getByText(/Подтверждение команды требует результата applied/)).toBeVisible();
  expect(screen.getByText(/Права на управление из этих данных не определяются/)).toBeVisible();
  expect(screen.queryByRole('switch')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
});

it.each([
  [{ ...relay, connection: 'offline', on: true } as Device, 'Core сообщает, что устройство не в сети.'],
  [{ ...relay, kind: 'other', typeLabel: 'relay', readings: [] } as Device, 'Для этих данных нет поддержанного управления Web.'],
])('gives an offline or unsupported reason without claiming a command failure', async (device, reason) => {
  render(<CoreControlNotice device={device} />);
  await userEvent.click(screen.getByText('О состоянии и управлении'));
  expect(screen.getByText(reason)).toBeVisible();
  expect(screen.getByText(/совпадение состояния не подтверждает/)).toBeVisible();
  expect(screen.queryByRole('status')).toBeNull();
});
