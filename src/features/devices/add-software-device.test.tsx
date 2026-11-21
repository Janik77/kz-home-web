import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { expect, it, vi } from 'vitest';
import { DraftGuard } from '../../app/draft-guard';
import { RepositoryProvider } from '../../app/services';
import { CoreError } from '../../data/core/errors';
import type { SoftwareOnboarding } from '../../data/core/software-onboarding';
import { createMockHomeRepository } from '../../data/mock/mock-home-repository';
import { initialHome } from '../../data/mock/fixtures';
import { coreDevice } from '../../test/core-fixtures';
import { AddSoftwareDevice } from './add-software-device';

const relay = { id:'pilot-relay', type:'relay' as const };
const room = initialHome.rooms[0]!;
const saved = { ...coreDevice, ...relay, room_id:room.id, name:'Свет', online:false, state:{} };
function mount(api: SoftwareOnboarding) {
  const repository = {...createMockHomeRepository(initialHome, 0), softwareOnboarding:api};
  const client = new QueryClient();
  const router = createMemoryRouter([{path:'/', element:
    <QueryClientProvider client={client}><RepositoryProvider value={repository}><DraftGuard><AddSoftwareDevice home={initialHome}/></DraftGuard></RepositoryProvider></QueryClientProvider>}]);
  return render(<RouterProvider router={router}/>);
}
it.each(['not-found','forbidden'] as const)('hides entry when Core reports %s', async kind => {
  const candidates = vi.fn(async () => { throw new CoreError(kind); });
  mount({candidates, claim:vi.fn(), check:vi.fn()});
  await waitFor(() => expect(candidates).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('button',{name:'Добавить устройство'})).not.toBeInTheDocument();
});
it('requires identity, room and name; reconciles one lost write without re-submitting', async () => {
  const claim = vi.fn(async () => { throw new CoreError('network'); });
  const check = vi.fn(async () => saved);
  const user = userEvent.setup();
  mount({candidates:async () => [relay], claim, check});
  await user.click(await screen.findByRole('button',{name:'Добавить устройство'}));
  const confirm = screen.getByRole('button',{name:'Подтвердить привязку'});
  expect(confirm).toBeDisabled();
  await user.selectOptions(screen.getByLabelText('Устройство'), relay.id);
  await user.selectOptions(screen.getByLabelText('Комната'), room.id);
  await user.type(screen.getByLabelText('Название'),'Свет');
  await user.click(confirm);
  expect(await screen.findByRole('alert')).toHaveTextContent('Добавление не подтверждено');
  expect(screen.getByLabelText('Название')).toBeDisabled();
  await user.click(screen.getByRole('button',{name:'Проверить привязку'}));
  const link = await screen.findByRole('link',{name:'Открыть комнату'});
  expect(link).toHaveAttribute('href', '/rooms/' + room.id);
  expect(claim).toHaveBeenCalledTimes(1);
  expect(check).toHaveBeenCalledWith({...relay, roomId:room.id, name:'Свет'}, expect.any(AbortSignal));
});
