import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { CoreSceneRun } from './core-scene-run';
import { renderHome } from '../../test/render-home';
import { createMockHomeRepository } from '../../data/mock/mock-home-repository';
import { initialHome } from '../../data/mock/fixtures';
import { createRunHistory } from '../../data/core/run-history';
import { CoreError } from '../../data/core/errors';
import type { SceneRun, SceneRuns } from '../../data/core/scene-runs';
const scene = { ...initialHome.scenes[0]!, revision: 1 };
function run(status: SceneRun['status'] = 'ready'): SceneRun {
  return { id: 'run', house_id: initialHome.house.id, scene_id: scene.id, scene_revision: 1, status,
    created_at: new Date().toISOString(), dispatch_deadline: new Date(Date.now() + 300000).toISOString(),
    actions: [{ position: 0, device_id: 'relay', requested_on: true, status: status === 'unknown' ? 'dispatch_unknown' : 'ready', receipt: null, failure_code: null }] };
}
function harness(initial = run()) {
  const service: SceneRuns = { history: createRunHistory(), permissions: vi.fn(async () => ['scene.read', 'scene.run', 'device.read', 'device.control']),
    create: vi.fn(async () => initial), read: vi.fn(async () => initial), dispatch: vi.fn(async () => initial) };
  const repository = { ...createMockHomeRepository({ ...initialHome, scenes: [scene] }, 0), sceneRuns: service };
  const mount = () => renderHome(repository, home => <CoreSceneRun scene={home.scenes[0]!} home={home} />);
  const view = mount();
  return { service, repository, mount, ...view };
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

it.each(['succeeded', 'expired', 'stopped'] as const)('starts a distinct %s follow-up only after fresh review and explicit confirmation', async status => {
  const h = harness(run(status));
  const first = await screen.findByRole('button', { name: 'Подготовить запуск' });
  await waitFor(() => expect(first).toBeEnabled()); await userEvent.click(first);
  await userEvent.click(await screen.findByRole('button', { name: 'Обновить сценарий для нового запуска' }));
  expect(h.service.create).toHaveBeenCalledTimes(1); expect(h.service.dispatch).not.toHaveBeenCalled();
  const next = screen.getByRole('button', { name: 'Подготовить новый запуск' });
  expect(next).toBeDisabled(); await userEvent.click(screen.getByRole('checkbox'));
  let resolve!: (value: SceneRun) => void;
  vi.mocked(h.service.create).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await userEvent.click(next); await userEvent.click(next);
  expect(h.service.create).toHaveBeenCalledTimes(2);
  const calls = vi.mocked(h.service.create).mock.calls;
  expect(calls[0]![2]).not.toBe(calls[1]![2]); expect(calls[1]![1]).toBe(1);
  await act(async () => resolve({ ...run(), id: 'new-run' })); expect(h.service.dispatch).not.toHaveBeenCalled();
});
it('recovers IDs after remount by GET only and warns before a separate intent with unread history', async () => {
  const h = harness(run('expired'));
  const button = await screen.findByRole('button', { name: 'Подготовить запуск' });
  await waitFor(() => expect(button).toBeEnabled()); await userEvent.click(button);
  h.unmount(); h.mount();
  expect(screen.queryByRole('button', { name: 'Подготовить запуск' })).not.toBeInTheDocument();
  await userEvent.click(await screen.findByRole('button', { name: 'Обновить сценарий для нового запуска' }));
  expect(screen.getByRole('button', { name: 'Подготовить новый запуск' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Отмена подготовки' }));
  await userEvent.click(screen.getByText('Недавние запуски этой сцены'));
  await userEvent.click(screen.getByRole('button', { name: 'Открыть запуск run' }));
  expect(h.service.read).toHaveBeenCalledTimes(1); expect(h.service.create).toHaveBeenCalledTimes(1); expect(h.service.dispatch).not.toHaveBeenCalled();
});
it('uses a newly fetched revision after conflict, never silently resubmits the old intent', async () => {
  const h = harness(); vi.mocked(h.service.create).mockRejectedValueOnce(new CoreError('conflict'));
  const button = await screen.findByRole('button', { name: 'Подготовить запуск' });
  await waitFor(() => expect(button).toBeEnabled()); await userEvent.click(button);
  h.repository.getHome = vi.fn(async () => ({ ...initialHome, scenes: [{ ...scene, revision: 4, name: 'Изменённый сценарий' }] }));
  await userEvent.click(screen.getByRole('button', { name: 'Обновить сценарий для нового запуска' }));
  expect(await screen.findByText(/Актуальная версия: 4/)).toBeVisible(); expect(h.service.create).toHaveBeenCalledTimes(1);
  vi.mocked(h.service.create).mockResolvedValueOnce({ ...run(), scene_revision: 4 });
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(screen.getByRole('button', { name: 'Подготовить новый запуск' }));
  const calls = vi.mocked(h.service.create).mock.calls; expect(calls).toHaveLength(2); expect(calls[1]![1]).toBe(4); expect(calls[1]![2]).not.toBe(calls[0]![2]);
  expect(h.service.dispatch).not.toHaveBeenCalled();
});


it.each(['unknown', 'timed_out'] as const)('retains conservative acknowledgement after A %s, B succeeded, GET updates and navigation', async outcome => {
  const h = harness();
  const a: SceneRun = { ...run(outcome === 'unknown' ? 'unknown' : 'stopped'), id: 'A', actions: [{ ...run().actions[0]!, status: outcome === 'unknown' ? 'blocked' : 'timed_out' }] };
  const b: SceneRun = { ...run('succeeded'), id: 'B', actions: [{ ...run().actions[0]!, status: 'applied' }] };
  h.service.history!.remember({ id: 'A', sceneId: scene.id, createdAt: a.created_at });
  h.service.history!.remember({ id: 'B', sceneId: scene.id, createdAt: b.created_at });
  vi.mocked(h.service.read).mockImplementation(async id => id === 'A' ? a : b);
  await userEvent.click(await screen.findByText('Недавние запуски этой сцены'));
  await userEvent.click(screen.getByRole('button', { name: 'Открыть запуск A' }));
  await userEvent.click(screen.getByRole('button', { name: 'Открыть запуск B' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Все действия подтверждены');
  await userEvent.click(screen.getByRole('button', { name: 'Обновить сценарий для нового запуска' }));
  expect(screen.getByRole('button', { name: 'Подготовить новый запуск' })).toBeDisabled();
  expect(screen.getByText(/Успех выбранного запуска/)).toBeVisible();
  await userEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByRole('button', { name: 'Подготовить новый запуск' })).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: 'Отмена подготовки' }));
  // Even a later GET resolving A cannot prove complete history or carry acknowledgement forward.
  vi.mocked(h.service.read).mockResolvedValue({ ...b, id: 'A' });
  await userEvent.click(screen.getByRole('button', { name: 'Открыть запуск A' }));
  await userEvent.click(screen.getByRole('button', { name: 'Обновить сценарий для нового запуска' }));
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Подготовить новый запуск' })).toBeDisabled();
  h.unmount(); const view = h.mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Обновить сценарий для нового запуска' }));
  expect(screen.getByRole('button', { name: 'Подготовить новый запуск' })).toBeDisabled();
  expect(h.service.create).not.toHaveBeenCalled(); expect(h.service.dispatch).not.toHaveBeenCalled();
  view.unmount();
  const isolated = harness(run('succeeded'));
  expect(screen.queryByText('Недавние запуски этой сцены')).not.toBeInTheDocument();
  const first = await screen.findByRole('button', { name: 'Подготовить запуск' });
  await waitFor(() => expect(first).toBeEnabled()); await userEvent.click(first);
  await userEvent.click(screen.getByRole('button', { name: 'Обновить сценарий для нового запуска' }));
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Подготовить новый запуск' })).toBeDisabled();
  expect(isolated.service.dispatch).not.toHaveBeenCalled();
});
