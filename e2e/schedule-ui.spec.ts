// Contract fixtures, NOT live Core evidence.
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { coreResponses, coreDevice } from '../src/test/core-fixtures';
import { themeStorageKey } from '../src/app/theme-context';
for (const theme of ['light', 'dark']) test(`schedule UI ${theme}`, async ({ page }, info) => {
 await page.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:themeStorageKey,value:theme});
 let timezone: string | null=null, revision=1;
 let rule: Record<string, unknown> | null=null;
 await page.route('**/core-api/**',async route=> {
  const req=route.request(),url=new URL(req.url()),path=url.pathname.replace('/core-api','')+url.search;
  if(path.endsWith('/me/permissions')) return route.fulfill({json:{house_id:'house-a',permissions:['device.read','automation.read','automation.manage','house.read','house.manage']}});
  if(path.includes('/me/device-favorites')) return route.fulfill({json:{device_ids:[]}});
  if(path==='/houses/house-a') { if(req.method()==='PATCH') {const body=req.postDataJSON();expect(body.expected_timezone_revision).toBe(revision);timezone=body.timezone;revision++;} return route.fulfill({json:{id:'house-a',name:'Family home',timezone,timezone_revision:revision}}); }
  if(path==='/automations') { if(req.method()==='POST') rule={...req.postDataJSON(),revision:1}; return route.fulfill({status:req.method()==='POST'?201:200,json:req.method()==='POST'?rule:rule?[rule]:[]}); }
  if(rule && path===`/automations/${rule.id}/dry-run`) return route.fulfill({json:{automation_id:rule.id,revision:rule.revision,eligible:true,conditions_match:true,issues:[],actions:[]}});
  if(rule && path===`/automations/${rule.id}`) { if(req.method()==='PATCH') {const {expected_revision,...body}=req.postDataJSON();expect(expected_revision).toBe(rule.revision);rule={...rule,...body,revision:Number(rule.revision)+1};} return route.fulfill({json:rule}); }
  if(path.startsWith('/events')) return route.fulfill({json:[]});
  if(path==='/devices?house_id=house-a') return route.fulfill({json:[{...coreDevice,type:'relay',capabilities:['on_off'],state:{on:false}}]});
  if(!(path in coreResponses)) throw Error(path); return route.fulfill({json:coreResponses[path]});
 });
 await page.goto('/'); await page.getByLabel('Электронная почта',{exact:true}).fill('owner@example.test'); await page.getByLabel('Пароль',{exact:true}).fill('fixture-only'); await page.getByLabel('Пароль',{exact:true}).press('Enter');
 await expect(page.getByRole('heading',{name:'Family home',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Настройки',exact:true}).click();
 await expect(page.getByLabel('Часовой пояс (IANA)')).toHaveValue(''); await page.getByLabel('Часовой пояс (IANA)').fill('Asia/Almaty'); await page.getByRole('button',{name:'Сохранить часовой пояс',exact:true}).click();
 await expect(page.getByText('Часовой пояс сохранён и прочитан из Core.')).toBeVisible();
 await page.screenshot({path:info.outputPath(`timezone-${theme}.png`),fullPage:true});
 if(await page.locator('.mobile-more summary').isVisible()) await page.locator('.mobile-more summary').click();
 await page.getByRole('link',{name:'Правила',exact:true}).click(); await page.getByRole('button',{name:'Создать правило'}).click(); await page.getByLabel('Название правила').fill('Утренний свет'); await page.getByLabel('Тип запуска').selectOption('schedule');
 await page.getByRole('combobox',{name:'Действие 1: устройство',exact:true}).selectOption(coreDevice.id);
 await expect(page.getByText('Часовой пояс дома: Asia/Almaty.')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
 await page.screenshot({path:info.outputPath(`schedule-${theme}.png`),fullPage:true});
 await page.getByRole('button',{name:'Сохранить правило',exact:true}).click();
 const card=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Утренний свет',exact:true})}); await expect(card).toContainText('Выключена');
 await card.getByRole('button',{name:'Редактировать правило',exact:true}).click(); await expect(page.getByLabel('Время дома')).toHaveValue('08:00'); await page.getByRole('button',{name:'Сохранить правило',exact:true}).click(); await expect(page.getByLabel('Время дома')).toHaveCount(0);
 await card.getByRole('button',{name:'Включить правило',exact:true}).click(); await card.getByRole('button',{name:'Подтвердить включение',exact:true}).click(); await expect(card).toContainText('Включена');
 await card.getByRole('button',{name:'Выключить правило',exact:true}).click(); await expect(card).toContainText('Выключена');
});
