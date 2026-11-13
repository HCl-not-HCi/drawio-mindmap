import { test as base, expect } from '@playwright/test';

// Opens draw.io the way developers do (README): ?p=mindmap loads the plugin through the
// registry entry in docker/drawio/PostConfig.js. Waits until the plugin has loaded.
export const test = base.extend({
  drawio: async ({ page }, use) => {
    const consoleMessages = [];
    page.on('console', (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));
    page.on('pageerror', (err) => consoleMessages.push({ type: 'pageerror', text: err.message }));

    // No offline=1: draw.io skips all plugins in offline mode (docs/decisions.md D3).
    await page.goto('/?p=mindmap&splash=0');
    await page.waitForFunction(() => window.mindmap?.version, null, { timeout: 30_000 });
    await use({ page, consoleMessages });
  },
});

/** Clicks Extras → Mindmap → `item` in the menubar. */
export async function clickMindmapMenuItem(page, item) {
  await page.locator('.geMenubar a', { hasText: /^Extras$/ }).click();
  await page.getByRole('menuitem', { name: 'Mindmap', exact: true }).hover();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

export { expect };
