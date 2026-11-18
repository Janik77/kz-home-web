// Intercepted fixtures only; actual Core acceptance is separate.
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { coreResponses,coreDevice } from '../src/test/core-fixtures';
import { themeStorageKey } from '../src/app/theme-context';
for(const theme of ['light','dark'])test(`scene full editing and non-executable copies ${theme}`,async({page},info)=>{
 await page.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:themeStorageKey,value:theme});
 const scenes:Record<string,Record<string,unknown>>={source:{id:'source',house_id:'house-a',name:'Вечер дома',revision:1,is_draft:false,actions:[{type:'device_state',device_id:'lamp-a',state:{on:true}}]}};
 const rules:Record<string,Record<string,unknown>>={rule:{id:'rule',house_id:'house-a',name:'Свет вечером',revision:1,enabled:false,trigger:{type:'device_state',device_id:'lamp-a',field:'on',operator:'eq',value:true},conditions:[],actions:[{type:'device_state',device_id:'lamp-a',state:{on:false}}]}};
 let writes=0,commands=0;
 await page.route('**/core-api/**',async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname.replace('/core-api','')+u.search;
  if(/execute|commands/.test(p)){commands++;throw Error('Definition flow must not execute');}
  if(p.endsWith('/me/permissions'))return route.fulfill({json:{house_id:'house-a',permissions:['house.read','device.read','scene.read','scene.manage','scene.run','device.control','automation.read','automation.manage','event.read']}});
  if(p.includes('/me/device-favorites'))return route.fulfill({json:{device_ids:[]}});
  if(p.startsWith('/devices?'))return route.fulfill({json:[{...coreDevice,type:'relay',capabilities:['on_off'],state:{on:false}}]});
  if(p.startsWith('/events'))return route.fulfill({json:[]});
  if(p==='/scenes')return route.fulfill({json:Object.values(scenes)});if(p==='/automations')return route.fulfill({json:Object.values(rules)});
  const match=p.match(/^\/(scenes|automations)\/([^/]+)(?:\/(duplicate|activate))?$/);
  if(match){const rows=match[1]==='scenes'?scenes:rules,id=match[2]!,row=rows[id]!;
   if(req.method()==='GET')return route.fulfill({json:row});
   const body=req.postDataJSON();expect(body.expected_revision).toBe(row.revision);writes++;
   if(match[3]==='duplicate'){rows[body.id]={...row,id:body.id,name:body.name,revision:1,...(match[1]==='scenes'?{is_draft:true}:{enabled:false})};return route.fulfill({status:201,json:rows[body.id]});}
   if(match[3]==='activate')rows[id]={...row,is_draft:false,revision:Number(row.revision)+1};
   else rows[id]={...row,name:body.name,actions:body.actions,revision:Number(row.revision)+1};
   return route.fulfill({json:rows[id]});
  }
  if(!(p in coreResponses))throw Error(p);return route.fulfill({json:coreResponses[p]});
 });
 await page.goto('/');await page.getByLabel('Электронная почта',{exact:true}).fill('owner@example.test');await page.getByLabel('Пароль',{exact:true}).fill('fixture');await page.getByLabel('Пароль',{exact:true}).press('Enter');await expect(page.getByRole('heading',{name:'Family home',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Сценарии',exact:true}).click();
 const source=page.getByRole('article',{name:'Вечер дома',exact:true});await source.getByRole('button',{name:'Изменить действия или создать копию'}).click();await source.getByLabel('Питание 1',{exact:true}).selectOption('false');await source.getByRole('button',{name:'Сохранить сценарий',exact:true}).click();await expect(source.getByText(/Название и действия сохранены/)).toBeVisible();expect(writes).toBe(1);
 await source.getByText('Создать копию сценария',{exact:true}).click();await source.getByLabel('Название копии',{exact:true}).fill('Мягкий вечер');await source.getByRole('button',{name:'Создать черновик-копию'}).click();const copy=page.getByRole('article',{name:'Мягкий вечер',exact:true});await expect(copy.getByText('Черновик',{exact:true})).toBeVisible();expect(writes).toBe(2);expect(commands).toBe(0);
 await copy.getByRole('button',{name:'Изменить действия или создать копию'}).click();await expect(copy.getByRole('button',{name:'Подготовить к запуску',exact:true})).toBeVisible();await page.screenshot({path:info.outputPath(`scene-draft-${theme}.png`),fullPage:true});
 await copy.getByRole('button',{name:'Подготовить к запуску',exact:true}).click();await copy.getByRole('button',{name:'Подтвердить подготовку'}).click();await expect(copy.getByText(/Сценарий подготовлен/)).toBeVisible();expect(commands).toBe(0);expect(writes).toBe(3);
 await page.screenshot({path:info.outputPath(`scene-prepared-${theme}.png`),fullPage:true});
 if(await page.locator('.mobile-more summary').isVisible())await page.locator('.mobile-more summary').click();await page.getByRole('link',{name:'Правила',exact:true}).click();
 const rule=page.locator('.automation-card').filter({has:page.getByRole('heading',{name:'Свет вечером',exact:true})});await rule.locator('summary').filter({hasText:'Создать выключенную копию'}).click();await rule.getByLabel('Название копии правила').fill('Второй свет');await rule.getByRole('button',{name:'Создать выключенную копию',exact:true}).click();await expect(page.getByRole('heading',{name:'Второй свет',exact:true})).toBeVisible();expect(writes).toBe(4);expect(commands).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);await page.screenshot({path:info.outputPath(`rule-disabled-copy-${theme}.png`),fullPage:true});
});
