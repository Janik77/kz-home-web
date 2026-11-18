import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, act } from '@testing-library/react';
import { NumericReadings } from './numeric-readings';
import type { Device } from '../../domain/home';
const now = '2026-11-18T12:00:00Z';
const device: Device = { id: 'a', name: 'Климат', roomId: 'r', connection: 'online', favorite: false, kind: 'other', typeLabel: 'Датчик', readings: [], numericReadings: [{ field: 'temperature', label: 'Температура', unit: '°C', value: 23, observedAt: now }] };
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('ages a fresh observation while the page stays open', () => {
  vi.useFakeTimers(); vi.setSystemTime(now); render(<NumericReadings device={device} />);
  expect(screen.getByText('Свежее показание')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(121000));
  expect(screen.getByText('Устарело · не используется для правил')).toBeInTheDocument();
});
it('labels offline last-known values and unknown freshness without inventing a measurement', () => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  const view = render(<NumericReadings device={{ ...device, connection: 'offline' }} />);
  expect(screen.getByText('Последнее известное · нет связи')).toBeInTheDocument();
  view.rerender(<NumericReadings device={{ ...device, numericReadings: [{ ...device.numericReadings![0]!, observedAt: null }] }} />);
  expect(screen.getByText('Свежесть неизвестна')).toBeInTheDocument();
  view.rerender(<NumericReadings device={{ ...device, numericReadings: [{ ...device.numericReadings![0]!, value: null }] }} />);
  expect(screen.getByText('Неизвестно')).toBeInTheDocument();
});
