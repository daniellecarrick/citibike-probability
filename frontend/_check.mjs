import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/Users/daniellecarrick/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

await page.goto('http://localhost:5180/');
await page.waitForSelector('.sample-commute-card', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1000);

const cards = await page.$$eval('.sample-commute-card', els => els.map(el => ({
  hasImg: !!el.querySelector('img'),
  imgSrc: el.querySelector('img')?.getAttribute('src') ?? null,
  imgNaturalWidth: el.querySelector('img')?.naturalWidth ?? null,
  classes: el.className,
  text: el.textContent,
})));

console.log('cards:', JSON.stringify(cards, null, 2));
console.log('console errors:', consoleErrors);

await page.screenshot({ path: '/private/tmp/claude-501/-Users-daniellecarrick-Desktop-PROJECTS-citibike-probability/4a85de8b-c31a-4c55-b5d5-7bde14484c5d/scratchpad/home.png', fullPage: true });

await browser.close();
