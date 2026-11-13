import { readFileSync } from 'node:fs';
import { test, expect, clickMindmapMenuItem } from './fixtures.js';

const { version } = JSON.parse(
  readFileSync(new URL('../../packages/plugin/package.json', import.meta.url)),
);

test('plugin loads and prints its version without page errors', async ({ drawio }) => {
  const { page, consoleMessages } = drawio;

  expect(await page.evaluate(() => window.mindmap.version)).toBe(version);
  expect(consoleMessages.map((m) => m.text)).toContain(`[mindmap] loaded v${version}`);
  expect(consoleMessages.filter((m) => m.type === 'pageerror')).toEqual([]);
});

test('Extras → Mindmap → About shows the version', async ({ drawio }) => {
  const { page } = drawio;

  await clickMindmapMenuItem(page, 'About Mindmap...');

  await expect(page.locator('.geDialog')).toContainText(`draw.io Mindmap plugin ${version}`);
});
