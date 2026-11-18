import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { renderHome } from '../../test/render-home';
import { initialHome } from '../../data/mock/fixtures';
import { createMockHomeRepository } from '../../data/mock/mock-home-repository';
import { HouseTimezoneSettings } from './house-timezone';
import { CoreError } from '../../data/core/errors';
import type { HouseClock } from '../../data/core/schedules';
function setup(overrides: Partial<HouseClock> = {}) {
 const service: HouseClock = { read: vi.fn(async()=>({id:'house-a',timezone:null,revision:1})), permissions: async()=>['house.manage'], save: vi.fn(async(timezone)=>({id:'house-a',timezone,revision:2})), ...overrides };
 renderHome({...createMockHomeRepository(initialHome,0),houseClock:service},()=> <HouseTimezoneSettings />); return service;
}
it('does not infer browser timezone and saves only explicit value with revision', async()=> {
 const s=setup(); const input=await screen.findByLabelText('Часовой пояс (IANA)'); expect(input).toHaveValue(''); expect(s.save).not.toHaveBeenCalled();
 await userEvent.type(input,'Asia/Almaty'); await userEvent.click(screen.getByRole('button',{name:'Сохранить часовой пояс'}));
 expect(s.save).toHaveBeenCalledWith('Asia/Almaty',1,expect.any(AbortSignal)); expect(await screen.findByText('Часовой пояс сохранён и прочитан из Core.')).toBeInTheDocument();
});
it('retains timezone draft on conflict and comparison does not overwrite',async()=> {
 const s=setup({save:vi.fn(async()=>{throw new CoreError('conflict');})}); const input=await screen.findByLabelText('Часовой пояс (IANA)');
 await userEvent.type(input,'Asia/Almaty'); await userEvent.click(screen.getByRole('button',{name:'Сохранить часовой пояс'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Запись изменилась'); expect(input).toHaveValue('Asia/Almaty');
 await userEvent.click(screen.getByRole('button',{name:'Сравнить часовой пояс с Core'})); expect(await screen.findByText(/В Core:/)).toBeInTheDocument(); expect(input).toHaveValue('Asia/Almaty'); expect(s.save).toHaveBeenCalledTimes(1);
});
it('read-only user sees actual timezone without write controls',async()=> {
 setup({permissions:async()=>['house.read'],read:async()=>({id:'house-a',timezone:'Asia/Almaty',revision:1})});
 expect(await screen.findByText(/Часовой пояс дома: Asia/)).toBeInTheDocument(); expect(screen.queryByRole('button',{name:'Сохранить часовой пояс'})).not.toBeInTheDocument();
});
it('unavailable or old Core is not interpreted as unset timezone',async()=> {
 setup({read:async()=>{throw new CoreError('protocol');}}); expect(await screen.findByRole('alert')).toHaveTextContent('Настройки времени недоступны'); expect(screen.queryByLabelText('Часовой пояс (IANA)')).not.toBeInTheDocument();
});
