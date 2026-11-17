import { test as base, expect } from '@playwright/test';

// Opens draw.io the way users do: docker/drawio/PostConfig.js registers the plugin and loads
// it by default, without ?p=mindmap (D24). Waits until the plugin has loaded.
export const test = base.extend({
  drawio: async ({ page }, use) => {
    const consoleMessages = [];
    page.on('console', (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));
    page.on('pageerror', (err) => consoleMessages.push({ type: 'pageerror', text: err.message }));

    // No offline=1: draw.io skips all plugins in offline mode (docs/decisions.md D3).
    await page.goto('/?splash=0&mindmapDebug=1');
    await page.waitForFunction(() => window.mindmap?.version, null, { timeout: 30_000 });
    // The plugin loads before draw.io opens the blank diagram; keys are lost until then.
    await page.waitForFunction(() => window.mindmapDebug?.ui.getCurrentFile() != null);
    await use({ page, consoleMessages });
  },
});

/** Clicks Extras → Mindmap → `item` in the menubar. */
export async function clickMindmapMenuItem(page, item) {
  await page.locator('.geMenubar a', { hasText: /^Extras$/ }).click();
  await page.getByRole('menuitem', { name: 'Mindmap', exact: true }).hover();
  // The accessible name includes the shortcut, if any (e.g. "New Mindmap Alt+Shift+M").
  const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.getByRole('menuitem', { name: new RegExp(`^${escaped}`) }).click();
}

export { expect };
