/**
 * Mobile UX audit: drives every screen at iPhone 17 size (402×874, touch,
 * iOS UA), saves screenshots, and fails if anything overflows the screen
 * horizontally or a control is smaller than a 44px tap target.
 *
 *   node scripts/mobile-audit.mjs [baseUrl] [outDir]
 *
 * Needs the dev server (and backend) running. Set CHROME_PATH to use a
 * specific Chromium build instead of Playwright's default.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? 'mobile-audit';
const MIN_TAP = 44;
mkdirSync(OUT, { recursive: true });

// Controls exempt from the tap-size rule: third-party map attribution, and
// controls inside cards whose whole surface is the real tap target.
const TAP_EXEMPT = ['mapboxgl-ctrl-logo', 'mapboxgl-ctrl-attrib-button', 'mapboxgl-ctrl-attrib', 'matrix-cell', 'week-tile', 'mapboxgl-ctrl-compass'];

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({
  viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', e => problems.push(`JS error: ${e.message}`));

async function shot(name, fullPage = false) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
}

async function audit(label) {
  const r = await page.evaluate(({ MIN_TAP, TAP_EXEMPT }) => {
    const vw = document.documentElement.clientWidth;
    const desc = el => `${el.tagName.toLowerCase()}${el.classList.length ? '.' + [...el.classList].join('.') : ''} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}"`;
    const visible = el => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[aria-hidden="true"]');
    };
    // Overflow: anything poking past the viewport that isn't inside a
    // horizontal scroller or a clipped container.
    const overflow = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue;
      const b = el.getBoundingClientRect();
      if (b.right <= vw + 1 && b.left >= -1) continue;
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflowX !== 'visible' || cs.overflow === 'hidden') { clipped = true; break; }
      }
      if (!clipped) overflow.push(desc(el));
    }
    const small = [];
    for (const el of document.querySelectorAll('button, a[href], select, input:not([type=hidden]), summary, [role=button]')) {
      if (!visible(el)) continue;
      if (TAP_EXEMPT.some(c => el.classList.contains(c))) continue;
      const b = el.getBoundingClientRect();
      // Range inputs are measured by their (styled) touch area height.
      if (b.height < MIN_TAP - 0.5 || b.width < MIN_TAP - 0.5) small.push(`${desc(el)} ${Math.round(b.width)}×${Math.round(b.height)}`);
    }
    const zoomInputs = [...document.querySelectorAll('input:not([type=range]):not([type=hidden]), select, textarea')]
      .filter(visible)
      .filter(el => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map(el => `${desc(el)} ${getComputedStyle(el).fontSize}`);
    return { scrollW: document.documentElement.scrollWidth, vw, overflow, small: [...new Set(small)], zoomInputs };
  }, { MIN_TAP, TAP_EXEMPT });
  const issues = [];
  if (r.scrollW > r.vw) issues.push(`page scrolls horizontally (${r.scrollW} > ${r.vw})`);
  r.overflow.slice(0, 10).forEach(o => issues.push(`overflows screen: ${o}`));
  r.small.forEach(s => issues.push(`tap target < ${MIN_TAP}px: ${s}`));
  r.zoomInputs.forEach(z => issues.push(`input < 16px (iOS zooms on focus): ${z}`));
  console.log(`\n${issues.length ? '✗' : '✓'} ${label}`);
  issues.forEach(i => console.log(`   ${i}`));
  problems.push(...issues.map(i => `${label}: ${i}`));
}

// Landing
await page.goto(`${BASE}/commute`);
await page.waitForSelector('.sample-commute-card', { timeout: 20000 });
await page.waitForTimeout(1200);
await shot('01-landing');
await shot('01-landing-full', true);
await audit('Commute landing');

// Station search
await page.locator('.station-combo').first().tap();
await page.waitForTimeout(400);
await page.keyboard.type('bedford');
await page.waitForTimeout(300);
await shot('02-station-search');
await audit('Station search');
await page.locator('.mobile-selector-item').first().tap();
await page.waitForTimeout(300);

// Results
await page.locator('.sample-commute-card').first().tap();
await page.locator('.planner-cta-btn').tap();
await page.waitForSelector('.forecast-headline', { timeout: 20000 });
await page.waitForTimeout(3500);
await shot('03-results');
await shot('03-results-full', true);
await audit('Commute results');

// Station pair widget (bikes at origin, docks at destination)
const pair = page.locator('.station-pair');
await pair.scrollIntoViewIfNeeded();
await pair.screenshot({ path: `${OUT}/03a-station-pair.png` });

// Week overview: heatmap (default), then the stacked line view
const overview = page.locator('.commute-overview');
await overview.scrollIntoViewIfNeeded();
await overview.screenshot({ path: `${OUT}/03b-overview-heatmap.png` });
await page.getByRole('button', { name: 'Lines', exact: true }).tap();
await page.waitForTimeout(400);
await overview.screenshot({ path: `${OUT}/03c-overview-lines.png` });
await audit('Week overview (lines)');
// Charts are read-only: tapping Thursday's line near 6 PM must not change the day or time
{
  const box = await page.locator('.commute-day-lines svg').boundingBox();
  const rowH = (box.height - 20 + 6) / 7;
  const dayBefore = await page.locator('.forecast-headline .chip-select').first().inputValue();
  const timeBefore = await page.locator('.forecast-headline .chip-select').nth(1).inputValue();
  await page.touchscreen.tap(box.x + 38 + (box.width - 44) * (18 / 23.5), box.y + rowH * 3 + rowH / 2);
  await page.waitForTimeout(400);
  const day = await page.locator('.forecast-headline .chip-select').first().inputValue();
  const time = await page.locator('.forecast-headline .chip-select').nth(1).inputValue();
  const ok = day === dayBefore && time === timeBefore;
  console.log(`\n${ok ? '✓' : '✗'} Tapping a day line left the day/time unchanged (day=${day} time=${time})`);
  if (!ok) problems.push('Tapping a day line changed the day/time');
}
// Back to the default so later screenshots match a first visit
await page.getByRole('button', { name: 'Heatmap', exact: true }).tap();

// Touch-scrub the pick-up chart: drag shows values, release must not change the time
await page.evaluate(() => window.scrollTo(0, 0));
const svg = page.locator('.pair-panel-origin svg');
if (await svg.count()) {
  await svg.scrollIntoViewIfNeeded();
  const box = await svg.boundingBox();
  const before = await page.locator('.forecast-headline .chip-select').nth(1).inputValue();
  const cdp = await ctx.newCDPSession(page);
  const y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * 0.2, y }] });
  for (let i = 3; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * (i / 10), y }] });
  }
  await shot('04-chart-scrub');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
  const after = await page.locator('.forecast-headline .chip-select').nth(1).inputValue();
  console.log(`\n${before === after ? '✓' : '✗'} Chart touch scrub left the departure time unchanged (${before} → ${after})`);
  if (before !== after) problems.push('Chart touch scrub changed the departure time');
}

// Methodology
await page.evaluate(() => window.scrollTo(0, 0));
await page.locator('.nav-btn-methodology').tap();
await page.waitForTimeout(500);
await shot('05-methodology');
await audit('Methodology');
await page.locator('.methodology-close').tap();

// Map
await page.locator('.header-tab', { hasText: 'Map' }).tap();
await page.waitForTimeout(6000);
await shot('06-map');
await audit('Map');
await page.locator('.mobile-map-status').tap();
await page.waitForTimeout(500);
await shot('07-map-filters');
await audit('Map filters');
await page.locator('.mobile-filter-done').tap();
await page.waitForTimeout(300);

// Station sheet: search for a station, then expand
await page.locator('.mobile-map-search').tap();
await page.waitForTimeout(400);
await page.keyboard.type('madison');
await page.waitForTimeout(300);
await page.locator('.mobile-selector-item').first().tap();
await page.waitForTimeout(2500);
await shot('08-station-sheet');
await audit('Station sheet (half)');
await page.locator('.mobile-handle-bar').tap();
await page.waitForTimeout(800);
await shot('09-station-sheet-full');
await audit('Station sheet (full)');

await browser.close();
console.log(`\nScreenshots in ${OUT}/`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log('\nNo problems.');
