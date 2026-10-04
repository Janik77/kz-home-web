import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SceneResult } from '../../domain/home';
import { initialHome } from '../../data/mock/fixtures';
import { createMockHomeRepository } from '../../data/mock/mock-home-repository';
import { renderHome } from '../../test/render-home';
import { SceneControls } from './scene-controls';

describe('trustworthy scene execution', () => {
  it('reports pending until the repository confirms, and blocks repeated execution', async () => {
    const repository = createMockHomeRepository(initialHome, 0);
    let resolve!: (result: SceneResult) => void;
    const activateScene = vi.fn(() => new Promise<SceneResult>((done) => { resolve = done; }));
    renderHome({ ...repository, activateScene }, (home) => <SceneControls home={home} />);
    const button = await screen.findByRole('button', { name: 'Activate Cozy evening' });
    await userEvent.click(button);
    expect(await screen.findByText('Running Cozy evening… Waiting for confirmation.')).toBeInTheDocument();
    expect(screen.queryByText(/Cozy evening applied/)).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(activateScene).toHaveBeenCalledTimes(1);
    await act(async () => resolve(await repository.activateScene('evening')));
    expect(await screen.findByText('Cozy evening applied · 3 controls updated.')).toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('shows affected rooms and unavailable actions, and reports partial success as a warning', async () => {
    renderHome(createMockHomeRepository(initialHome, 0), (home) => <SceneControls home={home} detailed />);
    const card = await screen.findByRole('article', { name: 'Leaving home' });
    expect(card).toHaveTextContent('6 devices · 4 rooms');
    expect(card).toHaveTextContent('1 control unavailable · will be skipped');
    await userEvent.click(within(card).getByText('View controls (6)'));
    expect(within(card).getByText('Desk lamp')).toBeVisible();
    await userEvent.click(within(card).getByRole('button', { name: 'Activate Leaving home' }));
    expect(await within(card).findByRole('status')).toHaveTextContent('partially applied · 5 controls updated · 1 control skipped');
    expect(card.querySelector('.feedback--warning')).not.toBeNull();
    expect(card.querySelector('.feedback--success')).toBeNull();
  });

  it('never presents a run with every action skipped as success', async () => {
    const seed = structuredClone(initialHome);
    seed.devices = seed.devices.map((device) => ({ ...device, connection: 'offline' }));
    renderHome(createMockHomeRepository(seed, 0), (home) => <SceneControls home={home} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Activate Leaving home' }));
    expect(await screen.findByText('Leaving home didn’t update any devices. 6 controls skipped (offline or unavailable).')).toBeInTheDocument();
    expect(screen.queryByText(/applied ·/)).not.toBeInTheDocument();
  });

  it('keeps execution failure understandable and allows an explicit retry', async () => {
    const repository = createMockHomeRepository(initialHome, 0);
    const activateScene = vi.fn().mockRejectedValueOnce(new Error('Internal adapter error')).mockImplementation(repository.activateScene);
    renderHome({ ...repository, activateScene }, (home) => <SceneControls home={home} />);
    const button = await screen.findByRole('button', { name: 'Activate Good night' });
    await userEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Check your devices and try again');
    expect(screen.queryByText(/Internal adapter/)).not.toBeInTheDocument();
    expect(activateScene).toHaveBeenCalledTimes(1);
    await userEvent.click(button);
    await waitFor(() => expect(screen.getByText('Good night applied · 4 controls updated.')).toBeInTheDocument());
    expect(activateScene).toHaveBeenCalledTimes(2);
  });
});
