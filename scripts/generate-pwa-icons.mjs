import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const icon = await readFile(resolve('public/icons/icon.svg'), 'utf8');
const browser = await chromium.launch({
  executablePath: process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'] || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});

try {
  for (const size of sizes) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body,svg{width:100%;height:100%;margin:0;display:block}</style>${icon}`,
    );
    await page.screenshot({ path: resolve(`public/icons/icon-${size}x${size}.png`) });
    await page.close();
  }
} finally {
  await browser.close();
}
