import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import {CreateHouse} from './create-house';
import {createServices} from '../../data/create-services';
import {coreResponses} from '../../test/core-fixtures';
it.each([201,409,503])('creates once and only confirms readback (POST %i)',async status=>{
 const writes:unknown[]=[];let saved:unknown;
 const fetcher=vi.fn<typeof fetch>(async(url,init)=>{const path=String(url).replace('/core-api','');if(path==='/houses'&&init?.method==='POST'){saved=JSON.parse(String(init.body));writes.push(saved);return status===201?Response.json(saved,{status}):new Response(null,{status});}if(path.startsWith('/houses/'))return Response.json(saved);return Response.json(coreResponses[path]);});
 const service=createServices({mode:'core',apiUrl:'/core-api'},fetcher);if(service.mode!=='core')throw Error();await service.session.login('a','b');
 const done=vi.fn(),guard=vi.fn();render(<CreateHouse session={service.session} onCreated={done} onGuardChange={guard}/>);const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Создать дом'}));await user.type(screen.getByLabelText('Название дома'),'Новый дом');await user.click(screen.getByRole('button',{name:'Сохранить дом'}));
 await waitFor(()=>expect(writes).toHaveLength(1));if(status===201)await waitFor(()=>expect(done).toHaveBeenCalledOnce());else{await screen.findByRole('alert');expect(done).not.toHaveBeenCalled();expect(screen.getByLabelText('Название дома')).toHaveValue('Новый дом');}
 expect(fetcher.mock.calls.some(([url])=>/commands|devices|members/.test(String(url)))).toBe(false);
});
