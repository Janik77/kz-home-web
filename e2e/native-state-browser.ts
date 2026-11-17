import { test as base } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Use a real default Chrome context: Playwright's regular test contexts force
// focus emulation on every attached page, preventing native visibility testing.
export const test = base.extend({
  context: async ({ playwright }, use, info) => {
    const profile = await mkdtemp(join(tmpdir(), 'kz-state-browser-'));
    const chrome = spawn('/usr/bin/google-chrome', [
      '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
      `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank',
    ], { stdio: 'ignore' });
    let browser;
    let video;
    try {
      let port = '';
      for (let i = 0; i < 100 && !port; i++) {
        if (chrome.exitCode !== null) throw new Error('Sandboxed native Chrome failed to start');
        try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]!; } catch { /* startup */ }
        if (!port) await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (!/^\d+$/.test(port)) throw new Error('No isolated Chrome debugging port');
      browser = await playwright.chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
      const context = browser.contexts()[0]!;
      // No no-sandbox, fake visibility getter, lifecycle freeze, or focus override.
      await mkdir(info.outputDir, { recursive: true });
      video = spawn('ffmpeg', ['-y', '-f', 'x11grab', '-video_size', '1440x1000', '-framerate', '12',
        '-i', process.env.DISPLAY!, '-an', '-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0',
        info.outputPath('native-state-screen.webm')], { stdio: 'ignore' });
      video.on('error', () => {});
      await use(context);
    } finally {
      if (video && video.pid) {
        const stopped = new Promise(resolve => video!.once('exit', resolve));
        video.kill('SIGINT');
        await Promise.race([stopped, new Promise(resolve => setTimeout(resolve, 5000))]);
      }
      if (browser) await browser.close();
      chrome.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 300));
      await rm(profile, { recursive: true, force: true });
    }
  },
});
