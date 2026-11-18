import { test, expect } from '@playwright/test';
// Real Core, wall clock, PostgreSQL, MQTT TLS and software relay; no route mocks.
test('LIVE explicit house timezone and scheduled confirmed relay', async ({ page }) => {
 const control=async(action:string)=> { const r=await fetch(`${process.env.RELAY_CONTROL_URL}/${action}`,{method:'POST',headers:{Authorization:`Bearer ${process.env.RELAY_CONTROL_KEY}`,'Content-Type':'application/json'},body:'{}'}); expect(r.status).toBe(200); return r.json(); };
 await page.goto('/'); await page.getByLabel('Электронная почта',{exact:true}).fill('owner@example.test'); await page.getByLabel('Пароль',{exact:true}).fill(process.env.RELAY_OWNER_PASSWORD!); await page.getByLabel('Пароль',{exact:true}).press('Enter');
 await expect(page.getByRole('heading',{name:'Fixture',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Настройки',exact:true}).click();
 await expect(page.getByLabel('Часовой пояс (IANA)')).toHaveValue('');
 await page.getByLabel('Часовой пояс (IANA)').fill('UTC'); await page.getByRole('button',{name:'Сохранить часовой пояс',exact:true}).click();
 await expect(page.getByText('Часовой пояс сохранён и прочитан из Core.')).toBeVisible();
 await page.getByRole('link',{name:'Правила',exact:true}).click(); await page.getByRole('button',{name:'Создать правило',exact:true}).click(); await page.getByLabel('Название правила').fill('Свет по времени дома'); await page.getByLabel('Тип запуска').selectOption('schedule');
 const target=new Date(Math.ceil((Date.now()+45000)/60000)*60000), time=target.toISOString().slice(11,16), day=(target.getUTCDay()+6)%7;
 await page.getByLabel('Время дома').fill(time);
 for(const [i,label] of ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].entries()) await page.getByRole('checkbox',{name:label,exact:true}).setChecked(i===day);
 await page.getByRole('combobox',{name:'Действие 1: устройство',exact:true}).selectOption('fixture_relay');
 await page.getByRole('button',{name:'Сохранить правило',exact:true}).click();
 const rule=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Свет по времени дома',exact:true})}); await expect(rule).toContainText('Выключено');
 await rule.getByRole('button',{name:'Редактировать правило',exact:true}).click(); await expect(page.getByLabel('Время дома')).toHaveValue(time); await page.getByRole('button',{name:'Сохранить правило',exact:true}).click(); await expect(page.getByLabel('Время дома')).toHaveCount(0);
 await rule.getByRole('button',{name:'Включить правило',exact:true}).click(); await rule.getByRole('button',{name:'Подтвердить включение',exact:true}).click(); await expect(rule).toContainText('Включено');
 expect(Date.now()).toBeLessThan(target.getTime()-5000); expect((await control('evidence')).received).toHaveLength(0);
 await rule.getByRole('button',{name:'Результаты запусков',exact:true}).click();
 while(Date.now()<target.getTime()+10000) { await control('refresh'); if((await control('evidence')).received.length) break; await page.waitForTimeout(1000); }
 await expect(rule).toContainText('Выполнено: ACK и состояние подтверждены',{timeout:20000}); expect((await control('evidence')).received).toHaveLength(1);
 await page.waitForTimeout(12000); expect((await control('evidence')).received).toHaveLength(1);
 await page.screenshot({path:'test-results/live-schedule-confirmed-desktop.png',fullPage:true}); await page.setViewportSize({width:390,height:844}); await page.screenshot({path:'test-results/live-schedule-confirmed-mobile.png',fullPage:true});
 await rule.getByRole('button',{name:'Выключить правило',exact:true}).click(); await expect(rule).toContainText('Выключено');
});
