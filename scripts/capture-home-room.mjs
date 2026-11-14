// Explicit demo-only composition matrix. No Core or production requests.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const dir = resolve('test-results/home-room-matrix'); await mkdir(dir, { recursive: true });
process.env.VITE_DATA_MODE = 'mock';
const server = await createServer({ server: { host: '127.0.0.1', port: 5188, strictPort: true } }); await server.listen();
const browser = await chromium.launch(); const manifest = [];
try {
 for (const dataset of ['one', 'many', 'empty', 'offline']) for (const width of [390, 1280, 1440, 1920]) for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 } });
  const errors=[];page.on('pageerror', e=>errors.push(e.message));
  for (const route of ['/', '/rooms/living']) {
   await page.goto(`http://127.0.0.1:5188${route}?demo=${dataset}`);
   await page.locator('.everyday-heading h1').waitFor();
   if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: theme === 'dark' ? 'Включить тёмную тему' : 'Включить светлую тему' }).click();
   await page.evaluate(() => document.fonts.ready);
   await page.locator('.everyday-events [role=status]').waitFor({state:'hidden'});
   if (!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)) throw Error(`overflow ${dataset} ${width} ${route}`);
   const name=`${dataset}-${width}-${theme}-${route==='/'?'home':'room'}.png`;
   await page.screenshot({path:resolve(dir,name),fullPage:true,animations:'disabled'});
   const metrics = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { width:r.width, height:r.height, top:r.top }; };
    const text = [...document.querySelectorAll('.everyday-heading h1, .device-card h3, .device-card__state, .everyday-empty, .everyday-room-summary span, .everyday-eyebrow, .everyday-connection, .device-card__room, .range-control__label, .everyday-section-title h2')].map(el => ({text:el.textContent, fontSize:parseFloat(getComputedStyle(el).fontSize), ...rect(el)}));
    const actions = [...document.querySelectorAll('.everyday-page button, .everyday-page a, .everyday-page input')].filter(el => el.getBoundingClientRect().width && el.getBoundingClientRect().height).map(el => ({name:el.getAttribute('aria-label') || el.textContent, ...rect(el)}));
    return { text, actions, deviceTop:document.querySelector('.device-card')?.getBoundingClientRect().top ?? null, deviceCount:document.querySelectorAll('.device-card').length };
   });
   if(metrics.actions.some(a=>a.height<43.9 || a.width<43.9)) throw Error(`small target ${name}: ${JSON.stringify(metrics.actions)}`);
   if(metrics.text.some(t=>t.fontSize<13)) throw Error(`small text ${name}`);
   if(dataset==='empty' && metrics.deviceCount!==0) throw Error(`not empty ${name}`);
   if(route!=='/' && width===1440 && dataset==='one' && metrics.deviceTop>230) throw Error(`room header too tall ${name}: ${metrics.deviceTop}`);
   manifest.push({metrics,name,dataset,width,theme,route,data:'explicit mock demo',height:await page.evaluate(()=>document.documentElement.scrollHeight)});
  }
  if(errors.length)throw Error(errors.join('\n'));
  await page.close();
 }
 await writeFile(resolve(dir,'manifest.json'),JSON.stringify(manifest,null,2));
} finally {await browser.close();await server.close();}
