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
 for (const dataset of ['one', 'many', 'unavailable']) for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
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
   await page.screenshot({path:resolve(dir,name),fullPage:true});
   manifest.push({name,dataset,width,theme,route,data:'explicit mock demo',height:await page.evaluate(()=>document.documentElement.scrollHeight)});
  }
  if(errors.length)throw Error(errors.join('\n'));
  await page.close();
 }
 await writeFile(resolve(dir,'manifest.json'),JSON.stringify(manifest,null,2));
} finally {await browser.close();await server.close();}
