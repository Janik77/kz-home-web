import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { initialHome } from '../../data/mock/fixtures';
import { createMockHomeRepository } from '../../data/mock/mock-home-repository';
import { renderHome } from '../../test/render-home';
import { HomePage } from './home-page';
import { countRu, displayName } from './signature-copy';

it('localizes only sample names and uses Russian count forms', () => {
  expect(displayName('Living room', false)).toBe('Гостиная');
  expect(displayName('Living room', true)).toBe('Living room');
  expect(displayName('Моя мастерская', false)).toBe('Моя мастерская');
  expect([1, 2, 5, 11, 21].map((n) => countRu(n, ['устройство', 'устройства', 'устройств']))).toEqual(['1 устройство', '2 устройства', '5 устройств', '11 устройств', '21 устройство']);
});

it('keeps an offline last-known ON device inactive and prohibits simulation commands', async () => {
  const seed = structuredClone(initialHome);
  const device = seed.devices.find((item) => item.id === 'living-main')!;
  device.connection = 'offline';
  const repository = createMockHomeRepository(seed, 0);
  const sendCommand = vi.fn(repository.sendCommand);
  renderHome({ ...repository, sendCommand }, () => <HomePage />);
  const card = await screen.findByRole('article', { name: 'Потолочный свет · Гостиная' });
  expect(card).toHaveTextContent('Не в сети · последнее: Включён · 72%');
  expect(card).not.toHaveClass('signature-device--active');
  expect(within(card).getByRole('switch')).toBeDisabled();
  expect(within(card).queryByRole('slider')).toBeNull();
  await userEvent.click(within(card).getByRole('switch'));
  expect(sendCommand).not.toHaveBeenCalled();
});

it('keeps Core data read-only and photo-free without substituting sample rooms', async () => {
  const seed = structuredClone(initialHome);
  seed.rooms.forEach((room) => { room.image = ''; });
  const repository = createMockHomeRepository(seed, 0);
  const sendCommand = vi.fn();
  const activateScene = vi.fn();
  renderHome({ ...repository, readOnly: true, sendCommand, activateScene }, () => <HomePage />);
  await screen.findByRole('heading', { name: 'Добро пожаловать домой' });
  expect(screen.getByRole('link', { name: 'Открыть комнату: Living room' })).toBeVisible();
  expect(document.querySelectorAll('.signature-room .interior-photo--empty')).toHaveLength(4);
  expect(document.querySelector('img')).toBeNull();
  expect(screen.queryByRole('switch')).toBeNull();
  expect(screen.queryByRole('slider')).toBeNull();
  expect(screen.queryByRole('button', { name: /Запустить сценарий/ })).toBeNull();
  await userEvent.click(screen.getByRole('article', { name: 'Cozy evening' }).querySelector('a')!);
  expect(sendCommand).not.toHaveBeenCalled();
  expect(activateScene).not.toHaveBeenCalled();
});

it('recovers gracefully from a broken room photograph', async () => {
  renderHome(createMockHomeRepository(initialHome, 0), () => <HomePage />);
  const room = await screen.findByRole('link', { name: 'Открыть комнату: Гостиная' });
  fireEvent.error(room.querySelector('img')!);
  expect(room.querySelector('img')).toBeNull();
  expect(room.querySelector('.interior-photo--empty')).not.toBeNull();
  expect(room).toHaveAttribute('href', '/rooms/living');
});

it('renders an empty Core home without fabricated telemetry or favorites', async () => {
  const seed = { ...structuredClone(initialHome), rooms: [], devices: [], scenes: [] };
  renderHome({ ...createMockHomeRepository(seed, 0), readOnly: true }, () => <HomePage />);
  await screen.findByRole('heading', { name: 'Добро пожаловать домой' });
  expect(screen.getByText('Нет измерений')).toBeVisible();
  expect(screen.getByText('0 из 0 в сети')).toBeVisible();
  expect(screen.getByText('Устройств пока нет.')).toBeVisible();
  expect(screen.getByText('Комнат пока нет.')).toBeVisible();
  expect(screen.queryByRole('article')).toBeNull();
});
