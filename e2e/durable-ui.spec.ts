// Contract fixtures only; not physical or real-Core evidence.
import AxeBuilder from '@axe-core/playwright';
import {test,expect} from '@playwright/test';
import {coreResponses,coreDevice} from '../src/test/core-fixtures';
import {themeStorageKey} from '../src/app/theme-context';
for(const theme of ['light','dark']) test(`durable scene ${theme}`,async({page},info)=>{
 await page.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:themeStorageKey,value:theme});
 let scene:Record<string,unknown>|null=null; let cancelled=false;
 await page.route('**/core-api/**',async route=>{
  const req=route.request(),u=new URL(req.url()),path=u.pathname.replace('/core-api','')+u.search;
  if(path.endsWith('/me/permissions'))return route.fulfill({json:{house_id:'house-a',permissions:['device.read','device.control','scene.read','scene.manage','scene.run','house.read']}});
  if(path.includes('/me/device-favorites'))return route.fulfill({json:{device_ids:[]}});
  if(path==='/scenes') {if(req.method()==='POST'){scene={...req.postDataJSON(),revision:1};expect(scene!.actions).toEqual([{type:'device_state',device_id:coreDevice.id,state:{on:true}},{type:'durable_wait',seconds:5},{type:'device_state',device_id:coreDevice.id,state:{on:false}}]);}return route.fulfill({status:req.method()==='POST'?201:200,json:req.method()==='POST'?scene:scene?[scene]:[]});}
  if(scene&&path===`/scenes/${scene.id}`)return route.fulfill({json:scene});
  if(scene&&path.includes('/scene-runs/')){
   if(path.endsWith('/cancel'))cancelled=true;
   const created='2026-11-18T00:00:00Z',due='2026-11-18T00:00:05Z',deadline='2026-11-18T00:01:05Z',resume='2026-11-18T00:00:35Z';
   const first={position:0,device_id:coreDevice.id,requested_on:true,status:'applied',failure_code:null,receipt:{command_id:'fixture-cmd',correlation_id:'fixture-correlation',house_id:'house-a',device_id:coreDevice.id,requested_on:true,status:'applied',expires_at:'2026-11-18T00:00:30Z',failure_code:null}};
   return route.fulfill({status:path.endsWith('/execute')?201:200,json:{id:'fixture-run',house_id:'house-a',scene_id:scene.id,scene_revision:1,execution_mode:'server',execution_error:null,created_at:created,dispatch_deadline:deadline,plan_deadline:deadline,status:cancelled?'cancelled':'waiting',...(cancelled?{cancelled_at:due}:{wait_due_at:due,resume_deadline:resume}),actions:[first,{position:1,type:'durable_wait',device_id:null,requested_on:null,seconds:5,due_at:due,resume_deadline:resume,status:cancelled?'cancelled':'waiting',failure_code:null,receipt:null},{position:2,device_id:coreDevice.id,requested_on:false,status:cancelled?'cancelled':'waiting',failure_code:null,receipt:null}]}});
  }

  if(path==='/devices?house_id=house-a')return route.fulfill({json:[{...coreDevice,type:'relay',capabilities:['on_off'],state:{on:false}}]});
  if(path.startsWith('/events'))return route.fulfill({json:[]});
  if(!(path in coreResponses))throw Error(path);return route.fulfill({json:coreResponses[path]});
 });
 await page.goto('/');await page.getByLabel('Электронная почта',{exact:true}).fill('owner@example.test');await page.getByLabel('Пароль',{exact:true}).fill('fixture-only');await page.getByLabel('Пароль',{exact:true}).press('Enter');
 await expect(page.getByRole('heading',{name:'Family home',exact:true})).toBeVisible();await page.getByRole('link',{name:'Сценарии',exact:true}).click();
 await page.getByRole('button',{name:'Создать сценарий',exact:true}).click();await page.getByLabel('Название сценария').fill('Свет с паузой');
 await page.getByRole('combobox',{name:'Устройство 1',exact:true}).selectOption(coreDevice.id);await page.getByRole('combobox',{name:'Питание 1',exact:true}).selectOption('true');
 await page.getByRole('button',{name:'Добавить действие',exact:true}).click();await page.getByRole('combobox',{name:'Устройство 2',exact:true}).selectOption(coreDevice.id);
 await page.getByRole('button',{name:'Добавить паузу после шага 1',exact:true}).click();await expect(page.getByLabel('Пауза 2: секунды')).toHaveValue('5');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
 await page.locator('h1').click(); await page.screenshot({path:info.outputPath(`durable-editor-${theme}.png`),fullPage:true});
 await page.getByRole('button',{name:'Сохранить сценарий',exact:true}).click();await expect(page.getByText('Сохранено и проверено в Core. Действия не запускались.')).toBeVisible();
 await expect(page.getByRole('heading',{name:'Свет с паузой',exact:true})).toBeVisible();
 const article=page.getByRole('article',{name:'Свет с паузой',exact:true});await expect(article).not.toContainText('Недоступно:');await expect(article).toContainText('Устройств: 1');
 await article.getByText('Запуск и результат',{exact:true}).click();const region=page.getByRole('region',{name:'Подтверждённый запуск: Свет с паузой'});await region.getByRole('button',{name:'Запустить сценарий',exact:true}).click();await expect(region).toContainText('Core сохраняет ожидание');await region.getByRole('button',{name:'Отменить оставшиеся шаги',exact:true}).click();await region.getByRole('button',{name:'Подтвердить отмену оставшихся шагов',exact:true}).click();await expect(region).toContainText('Оставшиеся шаги отменены');await expect(region).toContainText('Подтверждено: 1 из 2');
 await page.screenshot({path:info.outputPath(`durable-saved-${theme}.png`),fullPage:true});
});
