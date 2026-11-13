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
    const button = await screen.findByRole('button', { name: 'Запустить Уютный вечер' });
    await userEvent.click(button);
    expect(await screen.findByText('Симуляция: Уютный вечер…')).toBeInTheDocument();
    expect(screen.queryByText(/Уютный вечер applied/)).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(activateScene).toHaveBeenCalledTimes(1);
    await act(async () => resolve(await repository.activateScene('evening')));
    expect(await screen.findByText('Уютный вечер: выполнено · обновлено: 3. Только симуляция.')).toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('shows affected rooms and unavailable actions, and reports partial success as a warning', async () => {
    renderHome(createMockHomeRepository(initialHome, 0), (home) => <SceneControls home={home} detailed />);
    const card = await screen.findByRole('article', { name: 'Ушёл из дома' });
    expect(card).toHaveTextContent('Устройств: 6 · комнат: 4');
    expect(card).toHaveTextContent('Недоступно действий: 1 · будет пропущено');
    await userEvent.click(within(card).getByText('Действия (6)'));
    expect(within(card).getByText('Настольная лампа')).toBeVisible();
    await userEvent.click(within(card).getByRole('button', { name: 'Запустить Ушёл из дома' }));
    expect(await within(card).findByRole('status')).toHaveTextContent('частично выполнено · обновлено: 5 · Пропущено: 1');
    expect(card.querySelector('.feedback--warning')).not.toBeNull();
    expect(card.querySelector('.feedback--success')).toBeNull();
  });

  it('never presents a run with every action skipped as success', async () => {
    const seed = structuredClone(initialHome);
    seed.devices = seed.devices.map((device) => ({ ...device, connection: 'offline' }));
    renderHome(createMockHomeRepository(seed, 0), (home) => <SceneControls home={home} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Запустить Ушёл из дома' }));
    expect(await screen.findByText('Ушёл из дома: ни одно устройство не изменено. Пропущено: 6 (нет связи или доступа). Только симуляция.')).toBeInTheDocument();
    expect(screen.queryByText(/applied ·/)).not.toBeInTheDocument();
  });

  it('keeps execution failure understandable and allows an explicit retry', async () => {
    const repository = createMockHomeRepository(initialHome, 0);
    const activateScene = vi.fn().mockRejectedValueOnce(new Error('Internal adapter error')).mockImplementation(repository.activateScene);
    renderHome({ ...repository, activateScene }, (home) => <SceneControls home={home} />);
    const button = await screen.findByRole('button', { name: 'Запустить Спокойной ночи' });
    await userEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Проверьте устройства и повторите');
    expect(screen.queryByText(/Internal adapter/)).not.toBeInTheDocument();
    expect(activateScene).toHaveBeenCalledTimes(1);
    await userEvent.click(button);
    await waitFor(() => expect(screen.getByText('Спокойной ночи: выполнено · обновлено: 4. Только симуляция.')).toBeInTheDocument());
    expect(activateScene).toHaveBeenCalledTimes(2);
  });
});
