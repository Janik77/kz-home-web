import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { initialHome } from '../../data/mock/fixtures';
import { createMockHomeRepository } from '../../data/mock/mock-home-repository';
import { renderHome } from '../../test/render-home';
import type { Definitions } from '../../data/core/definitions';
import { CreateScene } from './definition-forms';

it('labels dynamic selects exactly and submits the ordered draft once', async () => {
  const createScene = vi.fn<Definitions['createScene']>(async () => undefined);
  const repository = { ...createMockHomeRepository(initialHome, 0), definitions: {
    permissions: async () => ['scene.read', 'scene.manage'], createScene, rename: vi.fn(),
  } };
  renderHome(repository, () => <CreateScene home={initialHome} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Создать сценарий' }));
  await userEvent.type(screen.getByLabelText('Название сценария', { exact: true }), 'Вечер');
  await userEvent.selectOptions(screen.getByLabelText('Устройство 1', { exact: true }), 'living-main');
  await userEvent.selectOptions(screen.getByLabelText('Питание 1', { exact: true }), 'true');
  await userEvent.click(screen.getByRole('button', { name: 'Добавить действие' }));
  await userEvent.selectOptions(screen.getByLabelText('Устройство 2', { exact: true }), 'living-main');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить сценарий' }));
  expect(createScene).toHaveBeenCalledTimes(1);
  expect(createScene.mock.calls[0]?.[0]).toMatchObject({ name: 'Вечер', actions: [
    { deviceId: 'living-main', on: true }, { deviceId: 'living-main', on: false },
  ] });
});
