import { expect, test, type Page } from '@playwright/test';

type W = { __ttm: { state: () => any; model: () => any } };
const model = (p: Page) => p.evaluate(() => {
  const M = (window as unknown as W).__ttm.model();
  return { n: M.tracks.length, placed: M.tracks.filter((t: any) => t.geo).length, levels: M.tracks.map((t: any) => t.geo && t.geo.level) };
});
const tab = (p: Page, name: string) => p.locator('.tabs button', { hasText: name }).click();

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // the test machine may have no internet (fonts, map tiles); everything else must be clean
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await expect(page.getByTestId('kpis')).toBeVisible();
});
test.afterEach(() => expect(errors).toEqual([]));

test('demo trial: every track placed on the map and scheduled', async ({ page }) => {
  const m = await model(page);
  expect(m.n).toBe(15);
  expect(m.placed).toBe(15);
  await expect(page.locator('.m-flag')).toHaveCount(15);
  await expect(page.locator('.g-labels .g-row')).toHaveCount(15);
  await expect(page.getByTestId('kpis')).toContainText('כל הבדיקות עברו');
});

test('adding a competitor updates the table, the schedule and the map', async ({ page }) => {
  await page.getByLabel('שם המוביל').fill('יקיר');
  await page.getByLabel('שם הכלב').fill('רקס');
  await page.getByRole('button', { name: 'הוסף', exact: true }).click();
  await expect(page.getByTestId('competitors').locator('tbody tr')).toHaveCount(16);
  await expect(page.locator('.m-flag')).toHaveCount(16);
  await expect(page.locator('.g-labels .g-row')).toHaveCount(16);
  expect((await model(page)).placed).toBe(16);
});

test('changing a level re-places that track with the new shape', async ({ page }) => {
  const row = page.getByTestId('competitors').locator('tbody tr').first();
  await row.getByLabel('רמה').selectOption('IFH2');
  await expect.poll(async () => (await model(page)).levels.filter((l: string) => l === 'IFH2').length).toBe(2);
  expect((await model(page)).placed).toBe(15);
});

test('one FH 3 entrant: no draw, record times from the timeline', async ({ page }) => {
  await page.getByRole('button', { name: 'מחק את הדוגמה' }).click();
  await page.getByLabel('שם המוביל').fill('דנה');
  await page.getByLabel('שם הכלב').fill('לונה');
  await page.locator('.box').filter({ hasText: 'הוספת נבחן' }).getByLabel('רמה').selectOption('IFH3');
  await page.getByRole('button', { name: 'הוסף', exact: true }).click();
  await expect(page.locator('.g-labels .g-row')).toHaveCount(1);
  await tab(page, 'קבוצות והגרלות');
  await expect(page.getByText('נבחן יחיד, ללא הגרלה')).toBeVisible();
  await page.locator('.g-labels .g-row').first().click();
  const ctrl = page.getByTestId('ctrl');
  await expect(ctrl).toContainText('עקבה חוצה');
  await ctrl.locator('input[data-actual="ls"]').fill('07:10');
  await ctrl.locator('input[data-actual="ls"]').press('Enter');
  await expect.poll(() => page.evaluate(() => Object.values((window as unknown as W).__ttm.state().actuals)[0] as any)).toMatchObject({ ls: 430 });
  await ctrl.getByRole('button', { name: '+15 דק׳' }).click();
  await expect(ctrl.locator('input[data-pin]')).not.toHaveValue('');
});

test('mark a field on the grid; tracks fit inside it; delete it', async ({ page }) => {
  await tab(page, 'שטח ומפה');
  await page.getByRole('button', { name: 'מחק את השטח והשבילים' }).click();
  await page.getByRole('button', { name: 'לחצו שוב כדי למחוק' }).click();
  await expect(page.getByTestId('fields')).toHaveCount(0);
  await page.getByRole('button', { name: 'סמן שטח', exact: true }).click();
  const box = (await page.locator('#map').boundingBox())!;
  for (const [fx, fy] of [[0.12, 0.12], [0.88, 0.12], [0.88, 0.88], [0.12, 0.88]]) await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.getByRole('button', { name: /סיים שטח/ }).click();
  await expect(page.getByTestId('fields').locator('tbody tr')).toHaveCount(1);
  await expect.poll(async () => (await model(page)).placed, { timeout: 15000 }).toBeGreaterThan(0);
  await expect(page.getByTestId('fit')).toContainText('התאמת השטח לנבחנים');
  await page.getByTestId('fields').getByRole('button', { name: 'מחק' }).click();
  await page.getByTestId('fields').getByRole('button', { name: 'לחצו שוב' }).click();
  await expect(page.getByTestId('fields')).toHaveCount(0);
});

test('draw for a stranger-laid group assigns every track', async ({ page }) => {
  await tab(page, 'קבוצות והגרלות');
  const g = page.getByTestId('group-FPR3-1');
  await g.getByRole('button', { name: 'ערוך הגרלה' }).click();
  await expect(g.getByText('טרם הוגרל')).toHaveCount(0);
  await expect(g.getByRole('button', { name: 'בטל הגרלה' })).toBeVisible();
});

test('share link opens the same trial on another device', async ({ page, browser }) => {
  await tab(page, 'שיתוף');
  await page.getByRole('button', { name: 'צור קישור' }).click();
  const url = await page.getByLabel('קישור השיתוף').inputValue();
  expect(url).toContain('#s=');
  const other = await browser.newPage();
  await other.goto(url);
  await expect(other.getByTestId('share-banner')).toContainText('15 נבחנים');
  await other.getByRole('button', { name: 'פתח את המבחן המשותף' }).click();
  await expect(other.locator('.m-flag')).toHaveCount(15);
  expect(other.url()).not.toContain('#s=');
  await other.close();
});

test('settings persist across a reload and re-place tracks', async ({ page }) => {
  await tab(page, 'הגדרות');
  const sep = page.locator('#s-sep');
  await sep.fill('30');
  await sep.press('Enter');
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__ttm.state().settings.sep)).toBe(30);
  await expect(page.locator('.busy')).toHaveCount(0, { timeout: 15000 });
  await page.reload();
  await expect(page.getByTestId('kpis')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as W).__ttm.state().settings.sep)).toBe(30);
});

test('live mode lists open steps and records them', async ({ page }) => {
  await page.getByRole('button', { name: 'הפעל מצב חי' }).first().click();
  const ev = page.getByTestId('live-ev').first();
  await expect(ev).toBeVisible();
  await ev.getByRole('button', { name: 'התחלת הנחה' }).click();
  await expect.poll(() => page.evaluate(() => Object.keys((window as unknown as W).__ttm.state().actuals).length)).toBe(1);
});
