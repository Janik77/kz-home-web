import { useQueryClient } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { renderHome } from '../../test/render-home';
import { initialHome } from '../../data/mock/fixtures';
import { createMockHomeRepository } from '../../data/mock/mock-home-repository';
import { CoreError } from '../../data/core/errors';
import type { Metadata, MetadataValue } from '../../data/core/metadata';
import { MetadataEditor } from './metadata-editor';
const base: MetadataValue = { kind: 'room', id: 'room-a', name: 'Кухня', parentId: 'floor-a', revision: 3 };
const parents = [{ id: 'floor-a', name: 'Первый этаж' }, { id: 'floor-b', name: 'Второй этаж' }];
function api(): Metadata { return { permissions: vi.fn(async () => ['house.read', 'house.manage']), read: vi.fn(async () => base), save: vi.fn(async (value, draft) => ({ ...value, ...draft, revision: value.revision! + 1 })) }; }
async function mount(service: Metadata) {
 const view = renderHome({ ...createMockHomeRepository(initialHome, 0), metadata: service }, () => <MetadataEditor kind="room" id="room-a" title="Название и этаж" parents={parents} />);
 await userEvent.click(await screen.findByRole('button', { name: 'Изменить название и размещение' }));
 return view;
}
it('renames and moves with revision, readback feedback, no extra submit', async () => {
 const service = api(); await mount(service);
 await userEvent.clear(await screen.findByLabelText('Название')); await userEvent.type(screen.getByLabelText('Название'), 'Столовая');
 await userEvent.selectOptions(screen.getByLabelText('Этаж'), 'floor-b'); await userEvent.dblClick(screen.getByRole('button', { name: 'Сохранить изменения' }));
 await screen.findByText('Изменения сохранены и прочитаны из Core.');
 expect(service.save).toHaveBeenCalledTimes(1); expect(service.save).toHaveBeenCalledWith(base, { name: 'Столовая', parentId: 'floor-b' }, expect.any(AbortSignal));
 expect(screen.getByRole('button', { name: 'Сохранить изменения' })).toBeDisabled();
});
it.each(['conflict', 'server'] as const)('retains draft after %s; requires compare and explicit rebase before any retry', async kind => {
 const service = api(); vi.mocked(service.save).mockRejectedValueOnce(new CoreError(kind)); await mount(service);
 await userEvent.clear(await screen.findByLabelText('Название')); await userEvent.type(screen.getByLabelText('Название'), 'Мой черновик');
 await userEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' })); await screen.findByRole('button', { name: 'Сравнить с Core' });
 expect(screen.getByLabelText('Название')).toHaveValue('Мой черновик'); expect(screen.getByRole('button', { name: 'Сохранить изменения' })).toBeDisabled();
 vi.mocked(service.read).mockResolvedValue({ ...base, name: 'Из другого окна', revision: 4 });
 await userEvent.click(screen.getByRole('button', { name: 'Сравнить с Core' })); await screen.findByText(/В Core: «Из другого окна»/);
 expect(service.save).toHaveBeenCalledTimes(1);
 await userEvent.click(screen.getByRole('button', { name: 'Сохранить черновик для новой версии' }));
 expect(service.save).toHaveBeenCalledTimes(1); expect(screen.getByLabelText('Название')).toHaveValue('Мой черновик');
 await userEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' })); await screen.findByText('Изменения сохранены и прочитаны из Core.');
 expect(service.save).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 4, name: 'Из другого окна' }), expect.objectContaining({ name: 'Мой черновик' }), expect.any(AbortSignal));
});
it('older Core never exposes a writable form', async () => { const service = api(); vi.mocked(service.read).mockResolvedValue({ ...base, revision: null }); await mount(service); await screen.findByText(/Этот Core не поддерживает защиту конфликтов/); expect(screen.queryByLabelText('Название')).not.toBeInTheDocument(); expect(service.save).not.toHaveBeenCalled(); });
it('missing rights does not allow mutation', async () => { const service = api(); vi.mocked(service.permissions).mockResolvedValue(['house.read']); await mount(service); await screen.findByText(/Изменение недоступно/); expect(screen.queryByLabelText('Название')).not.toBeInTheDocument(); });
it('scope unmount aborts pending save and ignores its late result', async () => {
 const service = api(); let resolve!: (value: MetadataValue) => void; const pending = new Promise<MetadataValue>(r => { resolve = r; }); let signal: AbortSignal | undefined;
 vi.mocked(service.save).mockImplementation(async (_base, _draft, s) => { signal = s; return pending; });
 const first = await mount(service); await userEvent.type(await screen.findByLabelText('Название'), ' старая'); await userEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' })); first.unmount(); expect(signal?.aborted).toBe(true);
 const next = api(); vi.mocked(next.read).mockResolvedValue({ ...base, name: 'Другой дом' }); await mount(next); await screen.findByDisplayValue('Другой дом');
 await act(async () => { resolve({ ...base, name: 'Поздний ответ', revision: 4 }); await pending; });
 expect(screen.getByLabelText('Название')).toHaveValue('Другой дом'); expect(screen.queryByText('Изменения сохранены и прочитаны из Core.')).not.toBeInTheDocument();
});

function RefreshMetadata() { const client = useQueryClient(); return <button onClick={() => void client.invalidateQueries({ queryKey: ['metadata'] })}>Обновить метаданные теста</button>; }
it('keeps unsaved fields across a transient background read error', async () => {
 const service = api();
 renderHome({ ...createMockHomeRepository(initialHome, 0), metadata: service }, () => <><RefreshMetadata /><MetadataEditor kind="room" id="room-a" title="Название и этаж" parents={parents} /></>);
 await userEvent.click(await screen.findByRole('button', { name: 'Изменить название и размещение' }));
 await userEvent.type(await screen.findByLabelText('Название'), ' черновик');
 vi.mocked(service.read).mockRejectedValue(new CoreError('server'));
 await userEvent.click(screen.getByRole('button', { name: 'Обновить метаданные теста' }));
 await screen.findByText(/Не удалось обновить данные. Черновик сохранён/);
 expect(screen.getByLabelText('Название')).toHaveValue('Кухня черновик'); expect(service.save).not.toHaveBeenCalled();
});
