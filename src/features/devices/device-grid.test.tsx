import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HomeSnapshot } from '../../domain/home';
import { initialHome } from '../../data/mock/fixtures';
import { createMockHomeRepository } from '../../data/mock/mock-home-repository';
import { renderHome } from '../../test/render-home';
import { DeviceGrid } from './device-grid';

describe('confirmed device controls', () => {
  it('keeps confirmed power and focus while pending, blocks duplicate commands, then confirms', async () => {
    const repository = createMockHomeRepository(initialHome, 0);
    let resolve!: (home: HomeSnapshot) => void;
    const sendCommand = vi.fn(() => new Promise<HomeSnapshot>((done) => { resolve = done; }));
    renderHome({ ...repository, sendCommand }, (home) => <DeviceGrid devices={home.devices} rooms={home.rooms} />);
    const toggle = await screen.findByRole('switch', { name: 'Ceiling lights in Living room' });
    await userEvent.click(toggle);
    expect(await screen.findByText('Updating… Waiting for confirmation.')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(toggle).toHaveFocus();
    await userEvent.click(toggle);
    expect(sendCommand).toHaveBeenCalledTimes(1);
    const updated = await repository.sendCommand({ type: 'set-power', deviceId: 'living-main', on: false });
    await act(async () => resolve(updated));
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    expect(await screen.findByText('Update confirmed.')).toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it('shows a homeowner-friendly failure and retries only on request', async () => {
    const repository = createMockHomeRepository(initialHome, 0);
    const sendCommand = vi.fn().mockRejectedValueOnce(new Error('Internal adapter error 500')).mockImplementation(repository.sendCommand);
    renderHome({ ...repository, sendCommand }, (home) => <DeviceGrid devices={home.devices} rooms={home.rooms} />);
    const toggle = await screen.findByRole('switch', { name: 'Ceiling lights in Living room' });
    await userEvent.click(toggle);
    expect(await screen.findByRole('alert')).toHaveTextContent('Its last confirmed state is shown');
    expect(screen.queryByText(/Internal adapter/)).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(sendCommand).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    expect(sendCommand).toHaveBeenCalledTimes(2);
  });

  it('restores a rejected slider draft without remounting or losing keyboard focus', async () => {
    const repository = createMockHomeRepository(initialHome, 0);
    const sendCommand = vi.fn().mockRejectedValue(new Error('Adapter failure'));
    renderHome({ ...repository, sendCommand }, (home) => <DeviceGrid devices={home.devices} rooms={home.rooms} />);
    const slider = await screen.findByRole('slider', { name: 'Ceiling lights brightness in Living room' });
    slider.focus();
    fireEvent.change(slider, { target: { value: '31' } });
    fireEvent.keyUp(slider, { key: 'ArrowLeft' });
    await screen.findByRole('alert');
    expect(slider).toHaveValue('72');
    expect(slider).toHaveFocus();
    expect(screen.getByRole('slider', { name: 'Ceiling lights brightness in Living room' })).toBe(slider);
    await userEvent.click(screen.getByRole('switch', { name: 'Coffee corner in Kitchen' }));
    await waitFor(() => expect(within(screen.getByRole('article', { name: 'Coffee corner in Kitchen' })).getByRole('alert')).toBeInTheDocument());
    expect(slider).toHaveValue('72');
  });

  it('cancels a pointer draft without issuing a command and blocks offline devices', async () => {
    const repository = createMockHomeRepository(initialHome, 0);
    const sendCommand = vi.fn(repository.sendCommand);
    renderHome({ ...repository, sendCommand }, (home) => <DeviceGrid devices={home.devices} rooms={home.rooms} />);
    const slider = await screen.findByRole('slider', { name: 'Ceiling lights brightness in Living room' });
    fireEvent.change(slider, { target: { value: '20' } });
    fireEvent.pointerCancel(slider);
    fireEvent.blur(slider);
    expect(slider).toHaveValue('72');
    expect(sendCommand).not.toHaveBeenCalled();
    const offline = screen.getByRole('article', { name: 'Desk lamp in Home office' });
    expect(within(offline).getByRole('switch')).toBeDisabled();
    expect(within(offline).queryByRole('slider')).not.toBeInTheDocument();
    expect(offline).toHaveTextContent('Last known: Off');
  });

  it('provides an empty device state', async () => {
    renderHome(createMockHomeRepository(initialHome, 0), (home) => <DeviceGrid devices={[]} rooms={home.rooms} />);
    expect(await screen.findByRole('heading', { name: 'No devices here yet' })).toBeInTheDocument();
  });
});
