import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { CoreSceneRun } from './core-scene-run';
import { renderHome } from '../../test/render-home';
import { createMockHomeRepository } from '../../data/mock/mock-home-repository';
import { initialHome } from '../../data/mock/fixtures';
import { CoreError } from '../../data/core/errors';
import type { SceneRun, SceneRuns } from '../../data/core/scene-runs';
const scene = { ...initialHome.scenes[0]!, revision: 1 };
function run(status: SceneRun['status'] = 'ready'): SceneRun {
  return { id: 'run', house_id: initialHome.house.id, scene_id: scene.id, scene_revision: 1, status,
    created_at: new Date().toISOString(), dispatch_deadline: new Date(Date.now() + 300000).toISOString(),
    actions: [{ position: 0, device_id: 'relay', requested_on: true, status: status === 'unknown' ? 'dispatch_unknown' : 'ready', receipt: null, failure_code: null }] };
}
function harness(initial = run()) {
  const service: SceneRuns = { permissions: vi.fn(async () => ['scene.read', 'scene.run', 'device.read', 'device.control']),
    create: vi.fn(async () => initial), read: vi.fn(async () => initial), dispatch: vi.fn(async () => initial) };
  const view = renderHome({ ...createMockHomeRepository(initialHome, 0), sceneRuns: service }, home => <CoreSceneRun scene={scene} home={home} />);
  return { service, ...view };
}
it('prepares without dispatch and retains original key and revision after 409 for explicit retry', async () => {
  const h = harness(); vi.mocked(h.service.create).mockRejectedValueOnce(new CoreError('conflict'));
  const button = await screen.findByRole('button', { name: 'Подготовить запуск' });
  await waitFor(() => expect(button).toBeEnabled()); await userEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveTextContent('Конфликт версии'); expect(h.service.dispatch).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Проверить прежнюю подготовку' }));
  const calls = vi.mocked(h.service.create).mock.calls; expect(calls).toHaveLength(2); expect(calls[0]!.slice(0, 3)).toEqual(calls[1]!.slice(0, 3));
  expect(await screen.findByRole('status')).toHaveTextContent('команды ещё не отправлены');
});
it('blocks repeat dispatch and aborts observation on unmount, without automatic continuation', async () => {
  const h = harness(); const button = await screen.findByRole('button', { name: 'Подготовить запуск' });
  await waitFor(() => expect(button).toBeEnabled()); await userEvent.click(button);
  let resolve!: (run: SceneRun) => void; vi.mocked(h.service.dispatch).mockImplementation(() => new Promise(done => { resolve = done; }));
  const dispatch = await screen.findByRole('button', { name: 'Выполнить действие 1' }); await userEvent.click(dispatch); await userEvent.click(dispatch);
  expect(h.service.dispatch).toHaveBeenCalledTimes(1); expect(dispatch).toBeDisabled();
  const signal = vi.mocked(h.service.dispatch).mock.calls[0]![2]; h.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => resolve(run('unknown'))); expect(h.service.read).not.toHaveBeenCalled();
});
it.each(['expired', 'stopped'] as const)('shows %s without dispatch or success', async status => {
  const h = harness(run(status)); const button = await screen.findByRole('button', { name: 'Подготовить запуск' });
  await waitFor(() => expect(button).toBeEnabled()); await userEvent.click(button);
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Подтверждено: 0 из 1'));
  expect(screen.queryByRole('button', { name: 'Выполнить действие 1' })).not.toBeInTheDocument(); expect(h.service.dispatch).not.toHaveBeenCalled();
});

it('observes a durable unknown claim without offering dispatch or automatic recovery', async () => {
  const h = harness(run('unknown')); const button = await screen.findByRole('button', { name: 'Подготовить запуск' });
  await waitFor(() => expect(button).toBeEnabled()); await userEvent.click(button);
  expect(await screen.findByRole('status')).toHaveTextContent('Результат неизвестен');
  expect(screen.getByText('Отправка неизвестна — повтора нет')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Выполнить действие 1' })).not.toBeInTheDocument();
  expect(h.service.dispatch).not.toHaveBeenCalled(); h.unmount();
});
